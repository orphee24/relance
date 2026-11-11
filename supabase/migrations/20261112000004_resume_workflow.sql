-- =============================================================================
-- Phase 2 : validation atomique d'un CV et CV principal
-- Fonctions security invoker : la RLS de l'appelant s'applique à chaque requête.
-- =============================================================================

-- Valide le profil extrait d'un CV : crée une nouvelle version et remplace les
-- compétences confirmées, en une seule transaction.
create or replace function public.save_verified_resume(
  p_resume_id uuid,
  p_content jsonb,
  p_skills jsonb,
  p_label text default null
)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_version integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_content) <> 'object' or jsonb_typeof(p_skills) <> 'array' then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_skills) > 100 then
    raise exception 'too many skills' using errcode = '22023';
  end if;

  -- Verrouille le CV (et vérifie qu'il appartient à l'appelant via la RLS)
  perform 1 from public.resumes where id = p_resume_id and user_id = v_user for update;
  if not found then
    raise exception 'resume not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_version
    from public.resume_versions where resume_id = p_resume_id;

  insert into public.resume_versions (user_id, resume_id, version_no, label, content)
  values (v_user, p_resume_id, v_version, coalesce(nullif(btrim(p_label), ''), 'Version ' || v_version), p_content);

  update public.resumes set user_verified_at = now() where id = p_resume_id;

  delete from public.skills where resume_id = p_resume_id;
  insert into public.skills (user_id, resume_id, name, category, evidence, source, confidence, user_confirmed)
  select v_user, p_resume_id,
         left(btrim(s ->> 'name'), 120),
         coalesce((s ->> 'category')::public.requirement_category, 'skill'),
         left(s ->> 'evidence', 1000),
         case when s ->> 'source' = 'user' then 'user' else 'resume' end,
         'verified',
         true
  from jsonb_array_elements(p_skills) s
  where nullif(btrim(s ->> 'name'), '') is not null
  on conflict do nothing;

  return v_version;
end $$;

revoke execute on function public.save_verified_resume(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_verified_resume(uuid, jsonb, jsonb, text) to authenticated;

create or replace function public.set_primary_resume(p_resume_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.resumes where id = p_resume_id and user_id = auth.uid()) then
    raise exception 'resume not found' using errcode = 'P0002';
  end if;
  update public.resumes set is_primary = false where user_id = auth.uid() and is_primary and id <> p_resume_id;
  update public.resumes set is_primary = true where id = p_resume_id;
end $$;

revoke execute on function public.set_primary_resume(uuid) from public, anon;
grant execute on function public.set_primary_resume(uuid) to authenticated;
