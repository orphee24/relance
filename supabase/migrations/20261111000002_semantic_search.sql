-- =============================================================================
-- Recherche sémantique (pgvector)
-- Dimension 1536 par défaut ; à aligner avec le modèle d'embedding configuré
-- (EMBEDDING_DIMENSIONS). Changer de dimension nécessite une nouvelle migration.
-- =============================================================================
create extension if not exists vector with schema extensions;

alter table public.skills add column embedding extensions.vector(1536);
alter table public.job_requirements add column embedding extensions.vector(1536);
alter table public.job_offers add column embedding extensions.vector(1536);

create index skills_embedding_idx on public.skills
  using hnsw (embedding extensions.vector_cosine_ops);
create index job_offers_embedding_idx on public.job_offers
  using hnsw (embedding extensions.vector_cosine_ops);

-- Compétences de l'utilisateur les plus proches d'un critère (RLS appliquée)
create or replace function public.match_user_skills(p_embedding extensions.vector(1536), p_limit int default 5)
returns table (skill_id uuid, name text, evidence text, similarity double precision)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.name, s.evidence,
         1 - (s.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.skills s
  where s.user_id = auth.uid() and s.embedding is not null
  order by s.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(p_limit, 1), 50)
$$;
revoke execute on function public.match_user_skills(extensions.vector, int) from public, anon;
grant execute on function public.match_user_skills(extensions.vector, int) to authenticated;
