-- Réseau : ajout atomique, doublons, vérification, import consenti, interactions, plafonds, isolation.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'ines@example.test'),
  ('aaaaaaaa-9999-9999-9999-999999999999', 'jules@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);

insert into public.applications (id, user_id, company_name, job_title)
values ('e0000000-0000-0000-0000-000000000001', auth.uid(), 'Néobanque Exemple', 'Product Designer');

do $$
declare n1 uuid; n2 uuid; c uuid;
begin
  n1 := public.add_network_contact(jsonb_build_object(
    'first_name', 'Claire', 'last_name', 'Durand', 'current_title', 'Lead Product Designer',
    'company_name', 'Néobanque Exemple SAS', 'profile_url', 'https://www.linkedin.com/in/claire-exemple',
    'role_type', 'manager', 'provider', 'assisted_search', 'verified', true,
    'application_id', 'e0000000-0000-0000-0000-000000000001', 'relevance_score', 70, 'strategy', 'manager',
    'score_breakdown', '{"score":70}'::jsonb));
  select contact_id into c from public.user_network_contacts where id = n1;
  assert (select employment_confidence from public.professional_contacts where id = c) = 'verified', 'verified when confirmed';
  assert (select count(*) from public.contact_verifications where contact_id = c) = 1, 'verification recorded';
  assert (select legal_basis from public.contact_sources where contact_id = c) = 'user_provided', 'legal basis recorded';
  assert (select relevance_score from public.application_contacts where network_contact_id = n1) = 70, 'linked with score';
  assert (select c2.normalized_name from public.professional_contacts p join public.companies c2 on c2.id = p.company_id where p.id = c) = 'neobanque exemple', 'company resolved';

  -- Même lien de profil : pas de doublon, la source supplémentaire est historisée
  n2 := public.add_network_contact(jsonb_build_object(
    'first_name', 'Claire', 'last_name', 'Durand', 'profile_url', 'HTTPS://www.linkedin.com/in/claire-exemple', 'provider', 'company_site',
    'source_url', 'https://neobanque-exemple.fr/equipe'));
  assert n1 = n2, 'same network contact reused';
  assert (select count(*) from public.professional_contacts) = 1, 'no duplicate person';
  assert (select count(*) from public.contact_sources) = 2, 'second source kept';

  -- Non confirmé : hypothèse
  n2 := public.add_network_contact(jsonb_build_object('first_name', 'Karim', 'current_title', 'Talent Acquisition', 'role_type', 'recruiter'));
  assert (select p.employment_confidence from public.user_network_contacts u join public.professional_contacts p on p.id = u.contact_id where u.id = n2) = 'inferred', 'inferred by default';
end $$;

-- Une source « fournisseur sous contrat » ne peut pas être déclarée par l'utilisateur
do $$ begin
  begin
    perform public.add_network_contact('{"first_name":"X","provider":"licensed_provider"}');
    raise exception 'FAIL: licensed provider accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Import consenti : doublons ignorés, relation directe, consentement journalisé
do $$ declare r jsonb; begin
  r := public.import_network_contacts('[
    {"first_name":"Claire","last_name":"Durand","profile_url":"https://www.linkedin.com/in/claire-exemple","company_name":"Néobanque Exemple"},
    {"first_name":"Léa","last_name":"Roux","company_name":"Santé Exemple","current_title":"UX Researcher","role_type":"other"},
    {"first_name":"Léa","last_name":"Roux","company_name":"Santé Exemple SA"},
    {"first_name":"","last_name":""},
    {"first_name":"Tom","last_name":"Martin","profile_url":"http://insecure.example/tom"}
  ]', '2026-11-12');
  assert (r ->> 'created')::int = 2 and (r ->> 'duplicates')::int = 2, 'import counts: ' || r::text;
  assert (select count(*) from public.consent_records where consent_type = 'contact_import') = 1, 'consent recorded';
  assert (select profile_url from public.professional_contacts where last_name = 'Martin') is null, 'insecure url dropped';
  assert (select bool_and(has_mutual_connection) from public.user_network_contacts u join public.contact_sources s on s.contact_id = u.contact_id where s.provider = 'user_import'), 'direct relations';
  begin
    perform public.import_network_contacts('[]', '');
    raise exception 'FAIL: import without consent';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Interactions : statut et relances
do $$ declare n uuid; begin
  select id into n from public.user_network_contacts u where exists (select 1 from public.professional_contacts p where p.id = u.contact_id and p.first_name = 'Karim');
  perform public.log_network_interaction(n, 'message_sent', 'linkedin', 'Premier message');
  assert (select status from public.user_network_contacts where id = n) = 'contacted', 'contacted';
  perform public.log_network_interaction(n, 'message_sent', 'linkedin', 'Relance');
  assert (select follow_up_count from public.user_network_contacts where id = n) = 1, 'follow-up counted';
  perform public.log_network_interaction(n, 'reply_received');
  assert (select status from public.user_network_contacts where id = n) = 'replied', 'replied';

  update public.user_network_contacts set status = 'do_not_contact' where id = n;
  begin
    perform public.log_network_interaction(n, 'message_sent');
    raise exception 'FAIL: message to do_not_contact';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.log_network_interaction(n, 'note', null, 'A demandé à ne plus être contacté');
  assert (select status from public.user_network_contacts where id = n) = 'do_not_contact', 'status kept';
end $$;

-- Plafond quotidien de saisie
do $$ begin
  for i in 1..47 loop  -- 3 sources déjà saisies + 47 = 50
    perform public.add_network_contact(jsonb_build_object('first_name', 'Personne', 'last_name', i::text));
  end loop;
  begin
    perform public.add_network_contact('{"first_name":"Une de trop"}');
    raise exception 'FAIL: daily cap';
  exception when raise_exception then
    if sqlerrm <> 'contact_daily_limit' then raise; end if;
  end;
end $$;

-- Isolation : Jules ne voit rien, ne peut ni rattacher ni journaliser
select set_config('request.jwt.claim.sub', 'aaaaaaaa-9999-9999-9999-999999999999', false);
do $$ declare n uuid; begin
  assert (select count(*) from public.professional_contacts) = 0, 'contacts isolated';
  assert (select count(*) from public.contact_sources) = 0, 'sources isolated';
  assert (select count(*) from public.user_network_contacts) = 0, 'network isolated';
  select id into n from public.user_network_contacts limit 1;
  reset role;
  select id into n from public.user_network_contacts limit 1;
  set role authenticated;
  begin
    perform public.log_network_interaction(n, 'note');
    raise exception 'FAIL: foreign interaction';
  exception when no_data_found then null;
  end;
  begin
    perform public.add_network_contact(jsonb_build_object('first_name', 'X', 'application_id', 'e0000000-0000-0000-0000-000000000001'));
    raise exception 'FAIL: linked to foreign application';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;

select 'Network tests: ALL PASSED' as result;
