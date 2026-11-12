-- =============================================================================
-- Phase 6 : messages, relances, recommandations quotidiennes
-- Les messages ne sont jamais envoyés par Relance : l'utilisateur les copie et déclare l'envoi.
-- =============================================================================

alter table public.message_drafts add column sent_at timestamptz;

-- L'utilisateur déclare avoir envoyé un message préparé à une personne de son réseau.
create or replace function public.record_contact_message_sent(p_draft_id uuid, p_channel text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  d record;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select id, network_contact_id, application_id, sent_at into d
    from public.message_drafts where id = p_draft_id and user_id = v_user for update;
  if not found or d.network_contact_id is null then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  if d.sent_at is not null then
    return; -- idempotent
  end if;
  perform public.log_network_interaction(d.network_contact_id, 'message_sent', p_channel, 'Message préparé avec Relance', d.application_id);
  update public.message_drafts set sent_at = now() where id = p_draft_id;
end $$;
revoke execute on function public.record_contact_message_sent(uuid, text) from public, anon;
grant execute on function public.record_contact_message_sent(uuid, text) to authenticated;

-- L'utilisateur déclare avoir envoyé une relance de candidature.
-- Plus de deux relances ne sont pas enregistrées : au-delà, insister nuit à la candidature.
create or replace function public.record_application_follow_up(p_application_id uuid, p_draft_id uuid default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_status public.application_status;
  v_count integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select status into v_status from public.applications where id = p_application_id and user_id = v_user for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if p_draft_id is not null and exists (select 1 from public.message_drafts where id = p_draft_id and user_id = v_user and sent_at is not null) then
    select count(*) into v_count from public.application_events where application_id = p_application_id and type = 'follow_up_sent';
    return v_count; -- idempotent
  end if;
  select count(*) into v_count from public.application_events where application_id = p_application_id and type = 'follow_up_sent';
  if v_count >= 2 then
    raise exception 'follow_up_limit' using errcode = 'P0001';
  end if;

  insert into public.application_events (user_id, application_id, type, payload)
  values (v_user, p_application_id, 'follow_up_sent', jsonb_build_object('draft_id', p_draft_id));
  if v_status in ('sent', 'no_response') then
    perform public.set_application_status(p_application_id, 'followed_up');
  end if;
  if p_draft_id is not null then
    update public.message_drafts set sent_at = now() where id = p_draft_id and user_id = v_user;
  end if;
  return v_count + 1;
end $$;
revoke execute on function public.record_application_follow_up(uuid, uuid) from public, anon;
grant execute on function public.record_application_follow_up(uuid, uuid) to authenticated;

-- Remplace les recommandations en attente du jour. Les actions déjà faites ou écartées
-- aujourd'hui ne sont pas reproposées.
create or replace function public.replace_today_recommendations(p_rows jsonb, p_date date default current_date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_inserted integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10 then
    raise exception 'invalid payload' using errcode = '22023';
  end if;

  delete from public.recommendations where user_id = v_user and for_date = p_date and status = 'pending';

  insert into public.recommendations (user_id, for_date, kind, priority, title, reason, application_id, network_contact_id)
  select v_user, p_date, r ->> 'kind', (r ->> 'priority')::smallint, left(r ->> 'title', 300), left(r ->> 'reason', 1000),
         nullif(r ->> 'application_id', '')::uuid, nullif(r ->> 'network_contact_id', '')::uuid
  from jsonb_array_elements(p_rows) r
  where not exists (
    select 1 from public.recommendations x
    where x.user_id = v_user and x.for_date = p_date and x.status in ('done', 'dismissed')
      and x.kind = r ->> 'kind'
      and x.application_id is not distinct from nullif(r ->> 'application_id', '')::uuid
      and x.network_contact_id is not distinct from nullif(r ->> 'network_contact_id', '')::uuid
  );
  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;
revoke execute on function public.replace_today_recommendations(jsonb, date) from public, anon;
grant execute on function public.replace_today_recommendations(jsonb, date) to authenticated;
