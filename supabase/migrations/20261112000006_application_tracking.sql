-- =============================================================================
-- Phase 4 : suivi des candidatures
-- =============================================================================

-- Limite de candidatures suivies (non archivées) selon le forfait, appliquée par la base :
-- impossible à contourner depuis le client.
create or replace function public.enforce_tracked_applications_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_count integer;
begin
  if new.archived_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.archived_at is null then
    return new; -- déjà comptée
  end if;

  select (p.quotas ->> 'tracked_applications')::integer into v_limit
    from public.plans p where p.code = public.current_plan(new.user_id);
  if v_limit is null then
    return new; -- illimité
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':tracked_applications', 0));
  select count(*) into v_count from public.applications
    where user_id = new.user_id and archived_at is null and id <> new.id;
  if v_count >= v_limit then
    raise exception 'tracked_applications_limit' using errcode = 'P0001', detail = v_limit::text;
  end if;
  return new;
end $$;

create trigger applications_tracked_limit
  before insert or update of archived_at on public.applications
  for each row execute function public.enforce_tracked_applications_limit();

-- Changement de statut cohérent : date d'envoi renseignée automatiquement au premier envoi.
-- (L'historique est écrit par le trigger applications_status_log.)
create or replace function public.set_application_status(
  p_application_id uuid,
  p_status public.application_status,
  p_note text default null
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_prev public.application_status;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select status into v_prev from public.applications
    where id = p_application_id and user_id = v_user for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_prev = p_status then
    return;
  end if;

  update public.applications
     set status = p_status,
         applied_at = case
           when applied_at is null and p_status not in ('to_analyze', 'to_prepare', 'ready_to_send', 'withdrawn')
             then current_date
           else applied_at end
   where id = p_application_id;

  if nullif(btrim(p_note), '') is not null then
    insert into public.application_events (user_id, application_id, type, payload)
    values (v_user, p_application_id, 'note', jsonb_build_object('text', left(btrim(p_note), 2000)));
  end if;
end $$;

revoke execute on function public.set_application_status(uuid, public.application_status, text) from public, anon;
grant execute on function public.set_application_status(uuid, public.application_status, text) to authenticated;
