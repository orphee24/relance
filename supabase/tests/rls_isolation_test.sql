-- Tests d'isolation RLS et d'intégrité. Échoue (exception) au premier problème.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"first_name":"Alice","last_name":"Martin","terms_version":"2026-11-11","privacy_version":"2026-11-11"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test', '{"first_name":"Bob"}');

-- Profil créé automatiquement
do $$ begin
  assert (select count(*) from public.user_profiles) = 2, 'profiles auto-created';
  assert (select first_name from public.user_profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice', 'metadata copied';
  assert (select count(*) from public.consent_records where user_id = '11111111-1111-1111-1111-111111111111') = 2, 'signup consents recorded';
  assert (select count(*) from public.consent_records where user_id = '22222222-2222-2222-2222-222222222222') = 0, 'no consent without versions';
end $$;

-- ===== En tant qu'Alice =====
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.applications (id, user_id, company_name, job_title, status)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Société Générale SA', 'Développeuse Full-Stack', 'to_analyze');

update public.applications set status = 'sent', applied_at = current_date
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$ begin
  assert (select count(*) from public.application_events where application_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2,
    'status history logged (created + status_changed)';
  assert (select dedupe_key from public.applications limit 1) = 'societe generale|developpeuse full stack', 'dedupe key normalized';
end $$;

-- Ne peut pas insérer pour quelqu'un d'autre
do $$ begin
  begin
    insert into public.applications (user_id, company_name, job_title)
    values ('22222222-2222-2222-2222-222222222222', 'X', 'Y');
    raise exception 'FAIL: inserted row for another user';
  exception when insufficient_privilege then null;  -- RLS violation attendue
  end;
end $$;

-- Ne peut pas s'auto-promouvoir admin
do $$ begin
  begin
    update public.user_profiles set is_admin = true where id = auth.uid();
    raise exception 'FAIL: is_admin updated';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Mise à jour autorisée du profil
update public.user_profiles set target_job = 'Développeuse' where id = auth.uid();

-- Ne peut pas s'attribuer un forfait
do $$ begin
  begin
    insert into public.subscriptions (user_id, plan_code) values (auth.uid(), 'premium');
    raise exception 'FAIL: self-granted subscription';
  exception when insufficient_privilege then null;
  end;
  assert public.current_plan() = 'free', 'default plan is free';
end $$;

-- Résolution d'entreprise : domaine prioritaire, homonymes distincts
do $$
declare a uuid; b uuid; c uuid; d uuid;
begin
  a := public.resolve_company('Orange SA', 'orange.com');
  b := public.resolve_company('ORANGE', 'Orange.com');
  c := public.resolve_company('Orange', 'orange-bleue.fr');
  d := public.resolve_company('Orange', null);
  assert a = b, 'same domain → same company';
  assert a <> c, 'homonym with other domain → distinct';
  assert d <> a and d <> c, 'no domain → never attached to a company that has a domain';
end $$;

-- Ne peut pas écrire directement le référentiel
do $$ begin
  begin
    insert into public.companies (name, normalized_name) values ('Fake', 'fake');
    raise exception 'FAIL: direct company insert';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Contact + CRM réseau + garde « Ne plus contacter »
insert into public.professional_contacts (id, owner_user_id, first_name, last_name, current_title, role_type)
values ('cccccccc-0000-0000-0000-000000000001', auth.uid(), 'Claire', 'Durand', 'Engineering Manager', 'manager');
insert into public.contact_sources (contact_id, provider, legal_basis, added_by)
values ('cccccccc-0000-0000-0000-000000000001', 'user_manual', 'user_provided', auth.uid());
insert into public.user_network_contacts (id, user_id, contact_id, status)
values ('dddddddd-0000-0000-0000-000000000001', auth.uid(), 'cccccccc-0000-0000-0000-000000000001', 'do_not_contact');

do $$ begin
  begin
    insert into public.message_drafts (user_id, network_contact_id, recipient_type, purpose, body)
    values (auth.uid(), 'dddddddd-0000-0000-0000-000000000001', 'manager', 'first_contact', 'Bonjour');
    raise exception 'FAIL: draft to do_not_contact';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- Ne peut pas déclarer une source « fournisseur sous contrat »
do $$ begin
  begin
    insert into public.contact_sources (contact_id, provider, legal_basis, added_by)
    values ('cccccccc-0000-0000-0000-000000000001', 'licensed_provider', 'provider_contract', auth.uid());
    raise exception 'FAIL: user claimed licensed provider';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Export RGPD
do $$ declare e jsonb; begin
  e := public.export_my_data();
  assert jsonb_array_length(e -> 'applications') = 1, 'export contains own application';
  assert jsonb_array_length(e -> 'professional_contacts') = 1, 'export contains own contacts';
  assert not (e -> 'profile') ? 'is_admin', 'export omits internal admin flag';
end $$;

-- Stockage : ne peut écrire que dans son dossier
insert into storage.objects (bucket_id, name) values ('resumes', '11111111-1111-1111-1111-111111111111/cv.pdf');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('resumes', '22222222-2222-2222-2222-222222222222/cv.pdf');
    raise exception 'FAIL: wrote into other user folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===== En tant que Bob =====
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$ begin
  assert (select count(*) from public.applications) = 0, 'Bob cannot see Alice applications';
  assert (select count(*) from public.application_events) = 0, 'Bob cannot see Alice events';
  assert (select count(*) from public.professional_contacts) = 0, 'Bob cannot see Alice contacts';
  assert (select count(*) from public.contact_sources) = 0, 'Bob cannot see Alice contact sources';
  assert (select count(*) from public.user_profiles) = 1, 'Bob sees only his profile';
  assert (select count(*) from storage.objects) = 0, 'Bob cannot see Alice files';
  assert (select count(*) from public.plans) = 3, 'plans readable';
end $$;

-- Bob ne peut pas lier le contact privé d'Alice à son CRM
do $$ begin
  begin
    insert into public.user_network_contacts (user_id, contact_id)
    values (auth.uid(), 'cccccccc-0000-0000-0000-000000000001');
    raise exception 'FAIL: linked foreign private contact';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bob crée une candidature puis tente d'y rattacher le contact CRM d'Alice
insert into public.applications (id, user_id, company_name, job_title)
values ('bbbbbbbb-0000-0000-0000-000000000001', auth.uid(), 'Acme', 'Data Analyst');
do $$ begin
  begin
    insert into public.application_contacts (user_id, application_id, network_contact_id)
    values (auth.uid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');
    raise exception 'FAIL: cross-user application_contacts';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Bob ne peut pas modifier la candidature d'Alice (0 ligne affectée)
do $$ declare n int; begin
  update public.applications set notes = 'pwned' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'Bob cannot update Alice application';
end $$;

-- ===== Anonyme =====
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.plans) = 3, 'anon can read plans';
  begin
    perform 1 from public.applications;
    raise exception 'FAIL: anon read applications';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===== Rétention =====
reset role;
update public.professional_contacts set retention_until = now() - interval '1 day';
do $$ begin
  assert public.purge_expired_third_party_contacts() = 1, 'expired unlinked contact purged';
end $$;

-- ===== Suppression du compte : cascade =====
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.applications where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'cascade applications';
  assert (select count(*) from public.application_events where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'cascade events';
  assert (select count(*) from public.user_profiles where id = '11111111-1111-1111-1111-111111111111') = 0, 'cascade profile';
end $$;

select 'RLS & integrity tests: ALL PASSED' as result;
