-- Forfaits, remboursements, administration, fonctionnalités.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('cccccccc-1111-1111-1111-111111111111', 'max@example.test'),
  ('cccccccc-2222-2222-2222-222222222222', 'admin@example.test');
update public.user_profiles set is_admin = true where id = 'cccccccc-2222-2222-2222-222222222222';

-- L'utilisateur ne peut pas s'attribuer un forfait ni se rembourser
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-1111-1111-1111-111111111111', false);
do $$ begin
  begin
    perform public.grant_pass(auth.uid(), 'premium', 'cs_fake', 'pi_fake', 0, 'eur', now());
    raise exception 'FAIL: user granted a pass';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_metrics();
    raise exception 'FAIL: non-admin read metrics';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_update_plan('pro', 0, '{}', true);
    raise exception 'FAIL: non-admin updated plan';
  exception when insufficient_privilege then null;
  end;
  assert (public.my_entitlement() ->> 'plan') = 'free', 'free by default';
  assert public.feature_enabled('checkout'), 'flag readable';
  assert (select count(*) from public.feature_flags) = 0, 'flag table not readable directly (RLS)';
end $$;
reset role;

-- Webhook (service role) : attribution idempotente, prolongation, remboursement
set role service_role;
do $$
declare s1 uuid; s2 uuid; s3 uuid; e1 timestamptz; e2 timestamptz;
begin
  s1 := public.grant_pass('cccccccc-1111-1111-1111-111111111111', 'pro', 'cs_1', 'pi_1', 1900, 'eur', now(), 'https://pay.example/receipt/1');
  s2 := public.grant_pass('cccccccc-1111-1111-1111-111111111111', 'pro', 'cs_1', 'pi_1', 1900, 'eur', now());
  assert s1 = s2, 'idempotent';
  assert (select count(*) from public.payments) = 1, 'one payment';
  select ends_at into e1 from public.subscriptions where id = s1;
  assert e1 between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', '30 days';

  s3 := public.grant_pass('cccccccc-1111-1111-1111-111111111111', 'pro', 'cs_2', 'pi_2', 1900, 'eur', now());
  select starts_at, ends_at into e2, e1 from public.subscriptions where id = s3;
  assert e2 = (select ends_at from public.subscriptions where id = s1), 'second pass chained after the first';

  begin
    perform public.grant_pass('cccccccc-1111-1111-1111-111111111111', 'free', 'cs_3', 'pi_3', 0, 'eur', now());
    raise exception 'FAIL: free pass granted';
  exception when invalid_parameter_value then null;
  end;

  assert public.record_refund('pi_2', 500) = 'partially_refunded', 'partial refund';
  assert (select status from public.subscriptions where id = s3) = 'active', 'partial refund keeps access';
  assert public.record_refund('pi_1', 1900) = 'refunded', 'full refund';
  assert (select status from public.subscriptions where id = s1) = 'refunded', 'full refund revokes';
  assert public.record_refund('pi_unknown', 100) = 'unknown_payment', 'unknown payment';
  assert (select count(*) from public.audit_logs where action like 'pa%') >= 4, 'audited';
end $$;
reset role;

-- Accès : le second forfait (démarrage futur) n'est pas encore actif après remboursement du premier
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-1111-1111-1111-111111111111', false);
do $$ begin
  assert (public.my_entitlement() ->> 'plan') = 'free', 'refunded pass gives no access; chained one not started';
  assert (select count(*) from public.payments) = 2, 'user sees own payments';
end $$;

-- Administrateur
select set_config('request.jwt.claim.sub', 'cccccccc-2222-2222-2222-222222222222', false);
do $$ declare m jsonb; begin
  m := public.admin_metrics();
  assert (m ->> 'users_total')::int = 2, 'users counted';
  assert (m ->> 'revenue_30d_cents')::int = 1400, 'net revenue (1900 - 500 partial; full refund excluded): ' || (m ->> 'revenue_30d_cents');
  assert not (m::text ~ 'example\.test'), 'no personal data in metrics';
  perform public.admin_update_plan('pro', 2400, '{"offer_analyses": 40, "tracked_applications": null, "ai_follow_ups": null, "network_searches_per_day": 10, "interview_coach": false}', true);
  assert (select price_cents from public.plans where code = 'pro') = 2400, 'price updated';
  begin
    perform public.admin_update_plan('free', 100, '{}', true);
    raise exception 'FAIL: free plan priced';
  exception when invalid_parameter_value then null;
  end;
  perform public.admin_set_flag('checkout', false);
  assert not public.feature_enabled('checkout'), 'flag toggled';
  assert (select count(*) from public.admin_list_flags()) = 5, 'flags listed';
  assert (select count(*) from public.admin_recent_audit(10) where action in ('plan_updated', 'flag_updated')) = 2, 'admin actions audited';
  -- L'administrateur ne lit toujours pas les données des autres
  assert (select count(*) from public.applications) = 0, 'admin has no access to user content';
end $$;
reset role;

select 'Billing and admin tests: ALL PASSED' as result;
