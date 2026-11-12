-- =============================================================================
-- Phase 7 : forfaits 30 jours (paiement unique), remboursements, administration
-- Les fonctions de paiement ne sont exécutables que par le service role (webhook Stripe).
-- =============================================================================

-- Attribue un forfait après un paiement confirmé. Idempotent par session de paiement.
-- Un nouvel achat du forfait en cours prolonge sa période ; un autre forfait démarre immédiatement.
create or replace function public.grant_pass(
  p_user uuid,
  p_plan text,
  p_checkout_session text,
  p_payment_intent text,
  p_amount_cents integer,
  p_currency text,
  p_withdrawal_waiver_at timestamptz,
  p_receipt_url text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_existing uuid;
  v_days integer;
  v_start timestamptz;
  v_sub uuid;
begin
  select subscription_id into v_existing from public.payments where stripe_checkout_session_id = p_checkout_session;
  if found then
    return v_existing;
  end if;

  select duration_days into v_days from public.plans where code = p_plan and code <> 'free';
  if v_days is null then
    raise exception 'unknown paid plan %', p_plan using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':pass', 0));
  select coalesce(max(ends_at), now()) into v_start from public.subscriptions
    where user_id = p_user and plan_code = p_plan and status = 'active' and ends_at > now();

  insert into public.subscriptions (user_id, plan_code, status, is_recurring, starts_at, ends_at, stripe_checkout_session_id)
  values (p_user, p_plan, 'active', false, v_start, v_start + make_interval(days => v_days), p_checkout_session)
  returning id into v_sub;

  insert into public.payments (user_id, subscription_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, currency, status, invoice_url, withdrawal_waiver_at)
  values (p_user, v_sub, p_payment_intent, p_checkout_session, p_amount_cents, upper(left(coalesce(p_currency, 'eur'), 3)), 'succeeded', p_receipt_url, p_withdrawal_waiver_at);

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (p_user, 'pass_granted', 'subscription', v_sub::text, jsonb_build_object('plan', p_plan, 'amount_cents', p_amount_cents));
  return v_sub;
end $$;
revoke execute on function public.grant_pass(uuid, text, text, text, integer, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.grant_pass(uuid, text, text, text, integer, text, timestamptz, text) to service_role;

-- Remboursement : un remboursement total met fin à l'accès ; un remboursement partiel le conserve.
create or replace function public.record_refund(p_payment_intent text, p_refunded_cents integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_status text;
begin
  select id, subscription_id, amount_cents, user_id into p from public.payments where stripe_payment_intent_id = p_payment_intent for update;
  if not found then
    return 'unknown_payment';
  end if;
  v_status := case when p_refunded_cents >= p.amount_cents then 'refunded' else 'partially_refunded' end;
  update public.payments set refunded_cents = least(p_refunded_cents, p.amount_cents), status = v_status where id = p.id;
  if v_status = 'refunded' and p.subscription_id is not null then
    update public.subscriptions set status = 'refunded', canceled_at = now() where id = p.subscription_id;
  end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (p.user_id, 'payment_refunded', 'payment', p.id::text, jsonb_build_object('refunded_cents', p_refunded_cents, 'status', v_status));
  return v_status;
end $$;
revoke execute on function public.record_refund(text, integer) from public, anon, authenticated;
grant execute on function public.record_refund(text, integer) to service_role;

-- Forfait en cours de l'appelant, avec sa date de fin (fin cumulée des périodes enchaînées).
create or replace function public.my_entitlement()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', public.current_plan(auth.uid()),
    'quotas', (select quotas from public.plans where code = public.current_plan(auth.uid())),
    'ends_at', (
      select max(s.ends_at) from public.subscriptions s
      where s.user_id = auth.uid() and s.status = 'active' and s.plan_code = public.current_plan(auth.uid()) and s.ends_at > now()
    )
  )
$$;
revoke execute on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;

-- -----------------------------------------------------------------------------
-- Administration : agrégats uniquement, jamais de contenu (CV, messages, contacts)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.user_profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'users_total', (select count(*) from public.user_profiles),
    'signups_7d', (select count(*) from public.user_profiles where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from public.user_profiles where created_at > now() - interval '30 days'),
    'onboarding_completed', (select count(*) from public.user_profiles where onboarding_completed_at is not null),
    'active_passes', (select coalesce(jsonb_object_agg(plan_code, n), '{}') from (
        select plan_code, count(distinct user_id) n from public.subscriptions
        where status = 'active' and starts_at <= now() and ends_at > now() group by plan_code) x),
    'revenue_30d_cents', (select coalesce(sum(amount_cents - refunded_cents), 0) from public.payments where status in ('succeeded', 'partially_refunded') and created_at > now() - interval '30 days'),
    'refunds_30d', (select count(*) from public.payments where status in ('refunded', 'partially_refunded') and created_at > now() - interval '30 days'),
    'applications_total', (select count(*) from public.applications),
    'applications_sent_30d', (select count(*) from public.applications where applied_at > current_date - 30),
    'analyses_30d', (select count(*) from public.quota_events where feature = 'offer_analysis' and created_at > now() - interval '30 days'),
    'contacts_total', (select count(*) from public.user_network_contacts),
    'messages_sent_30d', (select count(*) from public.message_drafts where sent_at > now() - interval '30 days'),
    'ai_cost_30d_micros', (select coalesce(sum(cost_micros), 0) from public.ai_usage where created_at > now() - interval '30 days'),
    'ai_by_feature_30d', (select coalesce(jsonb_object_agg(feature, jsonb_build_object('calls', calls, 'failures', failures, 'tokens', tokens, 'cost_micros', cost)), '{}') from (
        select feature, count(*) calls, count(*) filter (where not success) failures, sum(input_tokens + output_tokens) tokens, sum(cost_micros) cost
        from public.ai_usage where created_at > now() - interval '30 days' group by feature) x),
    'deletion_requests_pending', (select count(*) from public.deletion_requests where status in ('pending', 'processing'))
  );
end $$;
revoke execute on function public.admin_metrics() from public, anon;
grant execute on function public.admin_metrics() to authenticated;

create or replace function public.admin_update_plan(p_code text, p_price_cents integer, p_quotas jsonb, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_code = 'free' and p_price_cents <> 0 then
    raise exception 'free plan must stay free' using errcode = '22023';
  end if;
  if p_code = 'free' and not p_active then
    raise exception 'free plan cannot be disabled' using errcode = '22023';
  end if;
  if jsonb_typeof(p_quotas) <> 'object' or p_price_cents < 0 or p_price_cents > 100000 then
    raise exception 'invalid plan' using errcode = '22023';
  end if;
  update public.plans set price_cents = p_price_cents, quotas = p_quotas, active = p_active, updated_at = now() where code = p_code;
  if not found then
    raise exception 'unknown plan' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'plan_updated', 'plan', p_code, jsonb_build_object('price_cents', p_price_cents, 'quotas', p_quotas, 'active', p_active));
end $$;
revoke execute on function public.admin_update_plan(text, integer, jsonb, boolean) from public, anon;
grant execute on function public.admin_update_plan(text, integer, jsonb, boolean) to authenticated;

-- Fonctionnalités activables
insert into public.feature_flags (key, enabled, description) values
  ('ai_generation', true, 'Rédaction et extraction par IA (si une clé est configurée)'),
  ('contact_import', true, 'Import CSV des relations'),
  ('team_page_extraction', true, 'Extraction des personnes d''une page « équipe » collée'),
  ('interview_coach', true, 'Coach d''entretien (forfait Premium)'),
  ('checkout', true, 'Achat de forfaits')
on conflict (key) do nothing;

create or replace function public.feature_enabled(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false)
$$;
revoke execute on function public.feature_enabled(text) from public, anon;
grant execute on function public.feature_enabled(text) to authenticated, service_role;

create or replace function public.admin_list_flags()
returns setof public.feature_flags language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query select * from public.feature_flags order by key;
end $$;
revoke execute on function public.admin_list_flags() from public, anon;
grant execute on function public.admin_list_flags() to authenticated;

create or replace function public.admin_set_flag(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.feature_flags set enabled = p_enabled, updated_at = now() where key = p_key;
  if not found then
    raise exception 'unknown flag' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'flag_updated', 'feature_flag', p_key, jsonb_build_object('enabled', p_enabled));
end $$;
revoke execute on function public.admin_set_flag(text, boolean) from public, anon;
grant execute on function public.admin_set_flag(text, boolean) to authenticated;

create or replace function public.admin_recent_audit(p_limit integer default 50)
returns table (created_at timestamptz, action text, target_type text, target_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query select a.created_at, a.action, a.target_type, a.target_id from public.audit_logs a
    order by a.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;
revoke execute on function public.admin_recent_audit(integer) from public, anon;
grant execute on function public.admin_recent_audit(integer) to authenticated;
