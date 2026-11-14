-- =============================================================================
-- Phase 8 : limitation de débit, traitement des suppressions, maintenance
-- Toutes ces fonctions sont réservées au service role (serveur Relance).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Limitation de débit (fenêtre fixe). La clé ne contient jamais d'IP en clair :
-- le serveur la hache (SHA-256) avant l'appel.
-- -----------------------------------------------------------------------------
create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

-- Enregistre un appel et indique s'il est autorisé.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Demandes de suppression : réservation par le job (pas de double traitement)
-- -----------------------------------------------------------------------------
alter table public.deletion_requests add column claimed_at timestamptz;

create or replace function public.claim_deletion_requests(p_limit integer default 20)
returns table (id uuid, user_id uuid) language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.deletion_requests d set status = 'processing', claimed_at = now()
  where d.id in (
    select x.id from public.deletion_requests x
    where x.status = 'pending'
       -- une demande restée « en cours » plus d'une heure (job interrompu) est reprise
       or (x.status = 'processing' and x.claimed_at < now() - interval '1 hour')
    order by x.requested_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked)
  returning d.id, d.user_id;
end $$;
revoke execute on function public.claim_deletion_requests(integer) from public, anon, authenticated;
grant execute on function public.claim_deletion_requests(integer) to service_role;

create or replace function public.complete_deletion_request(p_id uuid, p_files_removed integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  update public.deletion_requests set status = 'completed', processed_at = now()
  where id = p_id and status = 'processing' returning user_id into v_user;
  if not found then
    raise exception 'deletion request not processing' using errcode = 'P0002';
  end if;
  -- Identifiant pseudonyme uniquement : aucune donnée de contenu.
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_user, 'account_deleted', 'user', v_user::text, jsonb_build_object('files_removed', p_files_removed));
end $$;
revoke execute on function public.complete_deletion_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_deletion_request(uuid, integer) to service_role;

-- L'utilisateur peut annuler sa demande tant qu'elle n'est pas en cours de traitement.
create or replace function public.cancel_my_deletion_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.deletion_requests set status = 'canceled', processed_at = now()
  where user_id = auth.uid() and status = 'pending';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.audit_logs (actor_user_id, action, target_type, target_id)
    values (auth.uid(), 'deletion_canceled', 'user', auth.uid()::text);
  end if;
  return n > 0;
end $$;
revoke execute on function public.cancel_my_deletion_request() from public, anon;
grant execute on function public.cancel_my_deletion_request() to authenticated;

-- Journalise la demande de suppression (déclencheur : l'utilisateur n'écrit pas dans audit_logs).
create or replace function public.audit_deletion_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_user_id, action, target_type, target_id)
  values (new.user_id, 'deletion_requested', 'user', new.user_id::text);
  return new;
end $$;
revoke execute on function public.audit_deletion_request() from public, anon, authenticated;
create trigger deletion_requests_audit after insert on public.deletion_requests
  for each row execute function public.audit_deletion_request();

-- -----------------------------------------------------------------------------
-- Maintenance quotidienne
-- -----------------------------------------------------------------------------
create or replace function public.run_daily_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_expired integer;
  v_contacts integer;
  v_rate integer;
  v_recos integer;
begin
  update public.subscriptions set status = 'expired'
  where status = 'active' and ends_at is not null and ends_at <= now();
  get diagnostics v_expired = row_count;

  v_contacts := public.purge_expired_third_party_contacts();

  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_rate = row_count;

  update public.recommendations set status = 'expired'
  where status = 'pending' and for_date < current_date - 1;
  get diagnostics v_recos = row_count;

  return jsonb_build_object('passes_expired', v_expired, 'contacts_purged', v_contacts,
                            'rate_limit_rows_deleted', v_rate, 'recommendations_expired', v_recos);
end $$;
revoke execute on function public.run_daily_maintenance() from public, anon, authenticated;
grant execute on function public.run_daily_maintenance() to service_role;
grant execute on function public.purge_expired_third_party_contacts() to service_role;
