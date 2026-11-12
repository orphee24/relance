-- Messages, relances, recommandations.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('bbbbbbbb-1111-1111-1111-111111111111', 'kim@example.test'),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'lou@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-1111-1111-1111-111111111111', false);

insert into public.applications (id, user_id, company_name, job_title, status, applied_at)
values ('f0000000-0000-0000-0000-000000000001', auth.uid(), 'Néobanque Exemple', 'Product Designer', 'no_response', current_date - 10);

do $$
declare n uuid; d1 uuid; d2 uuid; c int;
begin
  -- Message à une personne : déclaré envoyé une seule fois
  n := public.add_network_contact('{"first_name":"Claire","role_type":"manager"}');
  insert into public.message_drafts (id, user_id, network_contact_id, application_id, recipient_type, purpose, body)
  values ('f1000000-0000-0000-0000-000000000001', auth.uid(), n, 'f0000000-0000-0000-0000-000000000001', 'manager', 'first_contact', 'Bonjour Claire, seriez-vous disponible ?')
  returning id into d1;
  perform public.record_contact_message_sent(d1, 'linkedin');
  perform public.record_contact_message_sent(d1, 'linkedin');
  assert (select count(*) from public.networking_interactions where network_contact_id = n and type = 'message_sent') = 1, 'idempotent send';
  assert (select status from public.user_network_contacts where id = n) = 'contacted', 'contact status';
  assert (select sent_at is not null from public.message_drafts where id = d1), 'draft marked sent';

  -- Relances de candidature : statut, idempotence, plafond de 2
  insert into public.message_drafts (id, user_id, application_id, recipient_type, purpose, body)
  values ('f1000000-0000-0000-0000-000000000002', auth.uid(), 'f0000000-0000-0000-0000-000000000001', 'recruiter', 'application_follow_up', 'Bonjour, pourriez-vous ?')
  returning id into d2;
  c := public.record_application_follow_up('f0000000-0000-0000-0000-000000000001', d2);
  assert c = 1, 'first follow-up';
  c := public.record_application_follow_up('f0000000-0000-0000-0000-000000000001', d2);
  assert c = 1, 'same draft not counted twice';
  assert (select status from public.applications where id = 'f0000000-0000-0000-0000-000000000001') = 'followed_up', 'status followed_up';
  c := public.record_application_follow_up('f0000000-0000-0000-0000-000000000001');
  assert c = 2, 'second follow-up';
  begin
    perform public.record_application_follow_up('f0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: third follow-up';
  exception when raise_exception then
    if sqlerrm <> 'follow_up_limit' then raise; end if;
  end;

  -- Message vers une personne « Ne plus contacter » : impossible à préparer
  update public.user_network_contacts set status = 'do_not_contact' where id = n;
  begin
    insert into public.message_drafts (user_id, network_contact_id, recipient_type, purpose, body)
    values (auth.uid(), n, 'manager', 'follow_up', 'Bonjour ?');
    raise exception 'FAIL: draft to do_not_contact';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- Recommandations : remplacement, et pas de nouvelle proposition d'une action écartée
do $$ declare n int; begin
  n := public.replace_today_recommendations('[
    {"kind":"follow_up_application","priority":80,"title":"Relancer","reason":"Envoyée il y a 10 jours","application_id":"f0000000-0000-0000-0000-000000000001"},
    {"kind":"finalize_resume","priority":85,"title":"CV","reason":"Aucun CV vérifié"}]');
  assert n = 2, 'two inserted';
  update public.recommendations set status = 'dismissed' where kind = 'finalize_resume';
  n := public.replace_today_recommendations('[
    {"kind":"finalize_resume","priority":85,"title":"CV","reason":"Aucun CV vérifié"},
    {"kind":"verify_offer","priority":60,"title":"Analyser","reason":"Offre non analysée","application_id":"f0000000-0000-0000-0000-000000000001"}]');
  assert n = 1, 'dismissed action not proposed again';
  assert (select count(*) from public.recommendations where status = 'pending') = 1, 'previous pending replaced';
  assert (select count(*) from public.recommendations) = 2, 'dismissed kept';
end $$;

-- Isolation
select set_config('request.jwt.claim.sub', 'bbbbbbbb-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.recommendations) = 0, 'recommendations isolated';
  assert (select count(*) from public.message_drafts) = 0, 'drafts isolated';
  begin
    perform public.record_application_follow_up('f0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: foreign follow-up';
  exception when no_data_found then null;
  end;
  begin
    perform public.record_contact_message_sent('f1000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: foreign draft';
  exception when no_data_found then null;
  end;
end $$;
reset role;

select 'Messages and recommendations tests: ALL PASSED' as result;
