-- Quotas : plafond par forfait, atomicité, infalsifiabilité, restitution, version adaptée.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'eve@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);

do $$
declare e1 uuid; e2 uuid; e3 uuid; e4 uuid; s jsonb;
begin
  s := public.quota_status('offer_analysis');
  assert s ->> 'plan' = 'free' and (s ->> 'limit')::int = 3 and (s ->> 'remaining')::int = 3, 'free: 3 analyses';

  e1 := public.consume_quota('offer_analysis');
  e2 := public.consume_quota('offer_analysis');
  e3 := public.consume_quota('offer_analysis');
  e4 := public.consume_quota('offer_analysis');
  assert e1 is not null and e2 is not null and e3 is not null, 'three allowed';
  assert e4 is null, 'fourth refused';
  assert (public.quota_status('offer_analysis') ->> 'remaining')::int = 0, 'none remaining';

  -- Restitution après un échec de traitement
  assert public.refund_quota(e3), 'refund recent event';
  assert not public.refund_quota(e3), 'refund only once';
  assert (public.quota_status('offer_analysis') ->> 'remaining')::int = 1, 'one remaining after refund';

  -- Quota réseau quotidien
  assert (public.quota_status('network_search') ->> 'limit')::int = 2, 'free: 2 network searches per day';
end $$;

-- L'utilisateur ne peut pas effacer ou falsifier son journal
do $$ begin
  begin
    delete from public.quota_events;
    raise exception 'FAIL: deleted quota events';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.quota_events (user_id, feature) values (auth.uid(), 'offer_analysis');
    raise exception 'FAIL: inserted quota event';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.quota_events set created_at = now() - interval '1 year';
    raise exception 'FAIL: backdated quota event';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.quota_window(auth.uid(), 'offer_analysis');
    raise exception 'FAIL: internal function exposed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Un utilisateur ne peut pas restituer l'événement d'un autre
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
do $$ begin
  assert (select count(*) from public.quota_events) = 0, 'cannot see other user events';
  assert not public.refund_quota((select id from public.quota_events limit 1)), 'cannot refund other events';
  assert (public.quota_status('offer_analysis') ->> 'remaining')::int = 3, 'independent quotas';
end $$;

-- Forfait Pro actif (attribué par le service) : quota du forfait sur sa période
reset role;
insert into public.subscriptions (user_id, plan_code, starts_at, ends_at)
values ('66666666-6666-6666-6666-666666666666', 'pro', now() - interval '1 day', now() + interval '29 days');
set role authenticated;
do $$ declare s jsonb; begin
  s := public.quota_status('offer_analysis');
  assert s ->> 'plan' = 'pro' and (s ->> 'limit')::int = 30, 'pro: 30 analyses';
  assert s ->> 'window_end' is not null, 'pro window ends with the pass';
end $$;

-- Version adaptée rattachée à l'offre ; pas de rattachement à l'offre d'un autre
insert into public.resumes (id, user_id, title) values ('b0000000-0000-0000-0000-000000000001', auth.uid(), 'CV');
insert into public.job_offers (id, user_id, company_name, title, description)
values ('c0000000-0000-0000-0000-000000000001', auth.uid(), 'Néobanque Exemple', 'Product Designer', 'texte');
do $$ declare v int; begin
  v := public.save_verified_resume('b0000000-0000-0000-0000-000000000001', '{}', '[]', 'Adaptée', 'c0000000-0000-0000-0000-000000000001');
  assert (select source_offer_id from public.resume_versions where version_no = v) = 'c0000000-0000-0000-0000-000000000001', 'offer linked';
end $$;

reset role;
insert into public.job_offers (id, user_id, company_name, title, description)
values ('c0000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'Autre', 'Autre', 'texte');
set role authenticated;
do $$ begin
  begin
    perform public.save_verified_resume('b0000000-0000-0000-0000-000000000001', '{}', '[]', null, 'c0000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: linked foreign offer';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;

select 'Quota tests: ALL PASSED' as result;
