-- Tests de la phase 2 : validation atomique d'un CV, CV principal.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'carol@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'dan@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);

insert into public.resumes (id, user_id, title, is_primary) values
  ('a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'CV principal', true),
  ('a0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'CV anglais', false);

do $$
declare v int;
begin
  v := public.save_verified_resume(
    'a0000000-0000-0000-0000-000000000001',
    '{"identity":{"fullName":"Carol"}}',
    '[{"name":"Figma","category":"tool","evidence":"Figma, CSS"},
      {"name":"CSS","category":"skill","evidence":"Figma, CSS"},
      {"name":"Leadership","category":"soft_skill","evidence":"Ajouté par vous","source":"user"},
      {"name":"  ","category":"skill","evidence":"x"},
      {"name":"figma","category":"tool","evidence":"doublon"}]');
  assert v = 1, 'first version is 1';
  assert (select count(*) from public.skills where resume_id = 'a0000000-0000-0000-0000-000000000001') = 3, 'blank and duplicate skills ignored';
  assert (select bool_and(confidence = 'verified' and user_confirmed) from public.skills), 'skills verified';
  assert (select source from public.skills where name = 'Leadership') = 'user', 'user-added skill flagged';
  assert (select user_verified_at is not null from public.resumes where id = 'a0000000-0000-0000-0000-000000000001'), 'resume verified';

  v := public.save_verified_resume('a0000000-0000-0000-0000-000000000001', '{"identity":{}}', '[{"name":"Figma","category":"tool","evidence":"e"}]', 'Adapté Qonto');
  assert v = 2, 'second version is 2';
  assert (select label from public.resume_versions where version_no = 2) = 'Adapté Qonto', 'label kept';
  assert (select count(*) from public.skills where resume_id = 'a0000000-0000-0000-0000-000000000001') = 1, 'skills replaced';
end $$;

-- Atomicité : une catégorie invalide annule toute l'opération
do $$ begin
  begin
    perform public.save_verified_resume('a0000000-0000-0000-0000-000000000001', '{}', '[{"name":"X","category":"pirate","evidence":"e"}]');
    raise exception 'FAIL: invalid category accepted';
  exception when invalid_text_representation then null;
  end;
  assert (select count(*) from public.resume_versions where resume_id = 'a0000000-0000-0000-0000-000000000001') = 2, 'no partial version';
  assert (select count(*) from public.skills where resume_id = 'a0000000-0000-0000-0000-000000000001') = 1, 'skills untouched';
end $$;

-- CV principal : un seul à la fois
select public.set_primary_resume('a0000000-0000-0000-0000-000000000002');
do $$ begin
  assert (select id from public.resumes where is_primary) = 'a0000000-0000-0000-0000-000000000002', 'primary switched';
  assert (select count(*) from public.resumes where is_primary) = 1, 'single primary';
end $$;

-- Un autre utilisateur ne peut ni valider ni promouvoir ce CV
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
do $$ begin
  begin
    perform public.save_verified_resume('a0000000-0000-0000-0000-000000000001', '{}', '[]');
    raise exception 'FAIL: foreign resume verified';
  exception when no_data_found then null;
  end;
  begin
    perform public.set_primary_resume('a0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: foreign resume promoted';
  exception when no_data_found then null;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  begin
    perform public.save_verified_resume('a0000000-0000-0000-0000-000000000001', '{}', '[]');
    raise exception 'FAIL: anon executed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'Resume workflow tests: ALL PASSED' as result;
