-- =============================================================================
-- Phase 3 : quotas infalsifiables et versions de CV adaptées à une offre
-- =============================================================================

-- Journal de consommation des quotas. L'utilisateur peut le lire mais ni l'écrire
-- ni le modifier directement : supprimer une analyse ne rend pas le quota consommé.
create table public.quota_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('offer_analysis', 'ai_follow_up', 'network_search')),
  created_at timestamptz not null default now()
);
create index quota_events_user_feature_idx on public.quota_events (user_id, feature, created_at desc);

alter table public.quota_events enable row level security;
create policy quota_events_read_own on public.quota_events for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.quota_events from authenticated;

-- Fenêtre et plafond d'une fonctionnalité pour un utilisateur.
-- Forfait payant : la période du forfait en cours. Free : 30 jours glissants.
-- Recherche réseau : quota quotidien.
create or replace function public.quota_window(p_user uuid, p_feature text)
returns table (quota_limit integer, window_start timestamptz, window_end timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_plan text := public.current_plan(p_user);
  v_key text;
  v_quotas jsonb;
  v_start timestamptz;
  v_end timestamptz;
begin
  v_key := case p_feature
    when 'offer_analysis' then 'offer_analyses'
    when 'ai_follow_up' then 'ai_follow_ups'
    when 'network_search' then 'network_searches_per_day'
    else null end;
  if v_key is null then
    raise exception 'unknown feature %', p_feature using errcode = '22023';
  end if;

  select quotas into v_quotas from public.plans where code = v_plan;

  if p_feature = 'network_search' then
    v_start := date_trunc('day', now());
    v_end := v_start + interval '1 day';
  elsif v_plan = 'free' then
    v_start := now() - interval '30 days';
    v_end := null;
  else
    select s.starts_at, s.ends_at into v_start, v_end
      from public.subscriptions s
      where s.user_id = p_user and s.plan_code = v_plan and s.status = 'active'
        and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
      order by s.starts_at desc limit 1;
  end if;

  quota_limit := case when v_quotas -> v_key is null or jsonb_typeof(v_quotas -> v_key) = 'null'
                      then null else (v_quotas ->> v_key)::integer end;
  window_start := v_start;
  window_end := v_end;
  return next;
end $$;
revoke execute on function public.quota_window(uuid, text) from public, anon, authenticated;

-- État du quota pour l'appelant (sans consommer).
create or replace function public.quota_status(p_feature text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  w record;
  v_used integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into w from public.quota_window(v_user, p_feature);
  select count(*) into v_used from public.quota_events
    where user_id = v_user and feature = p_feature and created_at >= w.window_start;
  return jsonb_build_object(
    'plan', public.current_plan(v_user),
    'limit', w.quota_limit,
    'used', v_used,
    'remaining', case when w.quota_limit is null then null else greatest(w.quota_limit - v_used, 0) end,
    'window_start', w.window_start,
    'window_end', w.window_end
  );
end $$;
revoke execute on function public.quota_status(text) from public, anon;
grant execute on function public.quota_status(text) to authenticated;

-- Consomme une unité de quota de façon atomique (verrou par utilisateur et fonctionnalité).
-- Retourne l'identifiant de l'événement, ou null si le quota est épuisé.
create or replace function public.consume_quota(p_feature text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  w record;
  v_used integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_feature, 0));
  select * into w from public.quota_window(v_user, p_feature);
  if w.quota_limit is not null then
    select count(*) into v_used from public.quota_events
      where user_id = v_user and feature = p_feature and created_at >= w.window_start;
    if v_used >= w.quota_limit then
      return null;
    end if;
  end if;
  insert into public.quota_events (user_id, feature) values (v_user, p_feature) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.consume_quota(text) from public, anon;
grant execute on function public.consume_quota(text) to authenticated;

-- Restitue une unité si le traitement a échoué juste après la consommation (10 minutes max).
create or replace function public.refund_quota(p_event_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  delete from public.quota_events
    where id = p_event_id and user_id = auth.uid() and created_at > now() - interval '10 minutes';
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end $$;
revoke execute on function public.refund_quota(uuid) from public, anon;
grant execute on function public.refund_quota(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Versions de CV adaptées : rattachement à l'offre source
-- -----------------------------------------------------------------------------
drop function public.save_verified_resume(uuid, jsonb, jsonb, text);

create or replace function public.save_verified_resume(
  p_resume_id uuid,
  p_content jsonb,
  p_skills jsonb,
  p_label text default null,
  p_source_offer_id uuid default null
)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_version integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_content) <> 'object' or jsonb_typeof(p_skills) <> 'array' then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_skills) > 100 then
    raise exception 'too many skills' using errcode = '22023';
  end if;

  perform 1 from public.resumes where id = p_resume_id and user_id = v_user for update;
  if not found then
    raise exception 'resume not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_version
    from public.resume_versions where resume_id = p_resume_id;

  -- La clé étrangère composite garantit que l'offre appartient au même utilisateur.
  insert into public.resume_versions (user_id, resume_id, version_no, label, content, source_offer_id)
  values (v_user, p_resume_id, v_version, coalesce(nullif(btrim(p_label), ''), 'Version ' || v_version), p_content, p_source_offer_id);

  update public.resumes set user_verified_at = now() where id = p_resume_id;

  delete from public.skills where resume_id = p_resume_id;
  insert into public.skills (user_id, resume_id, name, category, evidence, source, confidence, user_confirmed)
  select v_user, p_resume_id,
         left(btrim(s ->> 'name'), 120),
         coalesce((s ->> 'category')::public.requirement_category, 'skill'),
         left(s ->> 'evidence', 1000),
         case when s ->> 'source' = 'user' then 'user' else 'resume' end,
         'verified',
         true
  from jsonb_array_elements(p_skills) s
  where nullif(btrim(s ->> 'name'), '') is not null
  on conflict do nothing;

  return v_version;
end $$;

revoke execute on function public.save_verified_resume(uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.save_verified_resume(uuid, jsonb, jsonb, text, uuid) to authenticated;

-- Le résultat d'analyse et la version de CV utilisée sont conservés avec l'offre.
alter table public.job_offers add column resume_version_id uuid;
alter table public.job_offers
  add foreign key (resume_version_id, user_id) references public.resume_versions (id, user_id) on delete set null (resume_version_id);
