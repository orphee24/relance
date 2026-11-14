-- Phase 8 : limitation de débit, suppression de compte, maintenance.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('dddddddd-1111-1111-1111-111111111111', 'lea@example.test'),
  ('dddddddd-2222-2222-2222-222222222222', 'noe@example.test');

-- L'utilisateur ne peut ni consommer la limitation de débit ni traiter les suppressions
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-1111-1111-1111-111111111111', false);
do $$ begin
  begin
    perform public.rate_limit_hit('x', 1, 60);
    raise exception 'FAIL: user called rate_limit_hit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_deletion_requests(10);
    raise exception 'FAIL: user claimed deletions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.run_daily_maintenance();
    raise exception 'FAIL: user ran maintenance';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.rate_limits) = 0, 'rate_limits not readable';
end $$;

-- Demande, annulation, nouvelle demande ; journalisée
insert into public.deletion_requests (user_id) values ('dddddddd-1111-1111-1111-111111111111');
do $$ begin
  assert public.cancel_my_deletion_request(), 'cancel pending';
  assert not public.cancel_my_deletion_request(), 'nothing left to cancel';
end $$;
insert into public.deletion_requests (user_id) values ('dddddddd-1111-1111-1111-111111111111');
reset role;

do $$ begin
  assert (select count(*) from public.audit_logs where action = 'deletion_requested') = 2, 'requests audited';
  assert (select count(*) from public.audit_logs where action = 'deletion_canceled') = 1, 'cancel audited';
end $$;

set role service_role;
do $$
declare r record; n integer := 0;
begin
  -- Limitation : 3 appels autorisés puis refus
  assert public.rate_limit_hit('k', 3, 60);
  assert public.rate_limit_hit('k', 3, 60);
  assert public.rate_limit_hit('k', 3, 60);
  assert not public.rate_limit_hit('k', 3, 60), 'fourth call refused';
  assert public.rate_limit_hit('other', 3, 60), 'keys are independent';

  for r in select * from public.claim_deletion_requests(10) loop
    n := n + 1;
    assert r.user_id = 'dddddddd-1111-1111-1111-111111111111';
  end loop;
  assert n = 1, 'one request claimed';
  assert (select count(*) from public.claim_deletion_requests(10)) = 0, 'no double claim';
end $$;
reset role;

-- Le serveur supprime l'utilisateur (auth.admin.deleteUser) : cascade
delete from auth.users where id = 'dddddddd-1111-1111-1111-111111111111';

set role service_role;
do $$ begin
  perform public.complete_deletion_request(
    (select id from public.deletion_requests where status = 'processing'), 2);
  assert (select status from public.deletion_requests where user_id = 'dddddddd-1111-1111-1111-111111111111' and status <> 'canceled') = 'completed';
  assert (select count(*) from public.audit_logs where action = 'account_deleted') = 1, 'deletion audited';
  assert (select count(*) from public.user_profiles where id = 'dddddddd-1111-1111-1111-111111111111') = 0, 'profile cascaded';
end $$;

-- Paiement anonymisé conservé ; forfait expiré par la maintenance
do $$
declare s uuid;
begin
  s := public.grant_pass('dddddddd-2222-2222-2222-222222222222', 'pro', 'cs_op', 'pi_op', 1900, 'eur', now());
  update public.subscriptions set starts_at = now() - interval '40 days', ends_at = now() - interval '10 days' where id = s;
  assert (public.run_daily_maintenance() ->> 'passes_expired')::int = 1, 'expired pass';
  assert (select status from public.subscriptions where id = s) = 'expired';
end $$;
reset role;

delete from auth.users where id = 'dddddddd-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.payments where stripe_checkout_session_id = 'cs_op' and user_id is null) = 1,
    'payment kept, anonymized';
end $$;

\echo 'Operations tests: ALL PASSED'
