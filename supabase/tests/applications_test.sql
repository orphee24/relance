-- Suivi des candidatures : limite par forfait, changement de statut, historique.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'gina@example.test'),
  ('88888888-8888-8888-8888-888888888888', 'hugo@example.test');

set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);

-- Free : 5 candidatures suivies au maximum
insert into public.applications (id, user_id, company_name, job_title)
select ('d0000000-0000-0000-0000-00000000000' || g)::uuid, auth.uid(), 'Entreprise ' || g, 'Poste'
from generate_series(1, 5) g;

do $$ begin
  begin
    insert into public.applications (user_id, company_name, job_title) values (auth.uid(), 'Sixième', 'Poste');
    raise exception 'FAIL: sixth application accepted';
  exception when raise_exception then
    if sqlerrm <> 'tracked_applications_limit' then raise; end if;
  end;
end $$;

-- Archiver libère une place ; une candidature archivée ne compte pas
update public.applications set archived_at = now() where id = 'd0000000-0000-0000-0000-000000000005';
insert into public.applications (id, user_id, company_name, job_title)
values ('d0000000-0000-0000-0000-000000000006', auth.uid(), 'Sixième', 'Poste');
insert into public.applications (user_id, company_name, job_title, archived_at)
values (auth.uid(), 'Archivée d''office', 'Poste', now());

-- Désarchiver alors que la limite est atteinte : refusé
do $$ begin
  begin
    update public.applications set archived_at = null where id = 'd0000000-0000-0000-0000-000000000005';
    raise exception 'FAIL: unarchive over limit';
  exception when raise_exception then
    if sqlerrm <> 'tracked_applications_limit' then raise; end if;
  end;
  -- Modifier une candidature active ne déclenche pas la limite
  update public.applications set notes = 'ok' where id = 'd0000000-0000-0000-0000-000000000001';
end $$;

-- Changement de statut : date d'envoi automatique, historique, note
do $$ begin
  perform public.set_application_status('d0000000-0000-0000-0000-000000000001', 'ready_to_send');
  assert (select applied_at from public.applications where id = 'd0000000-0000-0000-0000-000000000001') is null, 'no date before sending';
  perform public.set_application_status('d0000000-0000-0000-0000-000000000001', 'sent', 'Envoyée via le site carrière');
  assert (select applied_at from public.applications where id = 'd0000000-0000-0000-0000-000000000001') = current_date, 'applied_at set';
  perform public.set_application_status('d0000000-0000-0000-0000-000000000001', 'sent');  -- sans effet
  assert (select count(*) from public.application_events where application_id = 'd0000000-0000-0000-0000-000000000001' and type = 'status_changed') = 2, 'two transitions logged';
  assert (select payload ->> 'text' from public.application_events where application_id = 'd0000000-0000-0000-0000-000000000001' and type = 'note') = 'Envoyée via le site carrière', 'note logged';
  -- Retour en préparation : la date d'envoi est conservée
  perform public.set_application_status('d0000000-0000-0000-0000-000000000001', 'to_prepare');
  assert (select applied_at from public.applications where id = 'd0000000-0000-0000-0000-000000000001') = current_date, 'date kept';
end $$;

-- Un autre utilisateur ne peut pas changer le statut
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
do $$ begin
  begin
    perform public.set_application_status('d0000000-0000-0000-0000-000000000001', 'rejected');
    raise exception 'FAIL: foreign status change';
  exception when no_data_found then null;
  end;
end $$;

-- Pro : illimité
reset role;
insert into public.subscriptions (user_id, plan_code, starts_at, ends_at)
values ('88888888-8888-8888-8888-888888888888', 'pro', now() - interval '1 day', now() + interval '29 days');
set role authenticated;
insert into public.applications (user_id, company_name, job_title)
select auth.uid(), 'Pro ' || g, 'Poste' from generate_series(1, 8) g;
do $$ begin
  assert (select count(*) from public.applications) = 8, 'pro user not limited';
end $$;
reset role;

select 'Application tracking tests: ALL PASSED' as result;
