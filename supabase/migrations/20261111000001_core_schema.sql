-- =============================================================================
-- RELANCE — Schéma principal
-- Postgres 15+ (Supabase). Toutes les données personnelles sont isolées par RLS.
-- Les relations parent/enfant d'un même utilisateur sont garanties par des
-- clés étrangères composites (id, user_id) : impossible de rattacher une
-- ressource à celle d'un autre utilisateur, même via le service role.
-- =============================================================================

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
create type public.application_status as enum (
  'to_analyze',        -- À analyser
  'to_prepare',        -- À préparer
  'ready_to_send',     -- Prête à envoyer
  'sent',              -- Envoyée
  'no_response',       -- Sans réponse (n'est JAMAIS un refus)
  'followed_up',       -- Relancée
  'interview_scheduled',
  'interview_done',
  'offer_received',
  'rejected',          -- Refusée (uniquement sur information explicite)
  'withdrawn',         -- Retirée
  'accepted'
);

create type public.application_channel as enum (
  'job_board', 'company_site', 'spontaneous', 'recruiter', 'network_intro', 'referral', 'other'
);

create type public.contract_type as enum (
  'cdi', 'cdd', 'freelance', 'interim', 'alternance', 'stage', 'other'
);

create type public.network_contact_status as enum (
  'identified', 'to_contact', 'message_ready', 'contacted', 'replied',
  'in_conversation', 'intro_proposed', 'intro_obtained', 'no_response', 'do_not_contact'
);

create type public.contact_role_type as enum (
  'peer', 'manager', 'recruiter', 'hr', 'alumni', 'mutual', 'other'
);

create type public.contact_strategy as enum ('peer', 'manager', 'recruiter');

create type public.message_recipient_type as enum (
  'peer', 'manager', 'recruiter', 'alumni', 'mutual', 'introducer'
);

create type public.message_tone as enum ('professional', 'direct', 'warm', 'formal');

create type public.requirement_kind as enum ('mandatory', 'preferred');

create type public.requirement_category as enum (
  'skill', 'experience', 'education', 'language', 'certification', 'tool', 'soft_skill', 'other'
);

create type public.coverage_state as enum ('demonstrated', 'partial', 'missing', 'unknown');

-- verified : constaté dans une source ; inferred : hypothèse ; unknown : inconnu
create type public.confidence_level as enum ('verified', 'inferred', 'unknown');

create type public.recommendation_status as enum ('pending', 'done', 'dismissed', 'expired');

create type public.entitlement_status as enum ('active', 'expired', 'refunded', 'canceled');

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Normalisation générique : minuscules, sans accents, ponctuation compactée (miroir de src/lib/normalize.ts)
create or replace function public.normalize_text(p_text text)
returns text language sql immutable parallel safe as $$
  select nullif(btrim(regexp_replace(
    lower(translate(coalesce(p_text, ''),
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñŸÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYy')),
    '[^a-z0-9+#]+', ' ', 'g')), '')
$$;

-- Normalisation des noms d'entreprise (miroir de src/lib/normalize.ts)
create or replace function public.normalize_company_name(p_name text)
returns text language sql immutable parallel safe as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        lower(translate(coalesce(p_name, ''),
          'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñŸÿ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYy')),
        '\m(sa|sas|sasu|sarl|eurl|sca|snc|se|scop|group|groupe|holding|inc|ltd|llc|gmbh|plc)\M', ' ', 'g'),
      '[^a-z0-9]+', ' ', 'g')),
    '')
$$;

-- -----------------------------------------------------------------------------
-- Profils
-- -----------------------------------------------------------------------------
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text check (char_length(first_name) <= 100),
  last_name text check (char_length(last_name) <= 100),
  target_job text check (char_length(target_job) <= 200),
  experience_years smallint check (experience_years between 0 and 60),
  experience_level text check (experience_level in ('student', 'junior', 'confirmed', 'senior', 'executive')),
  location text check (char_length(location) <= 200),
  mobility text check (mobility in ('local', 'regional', 'national', 'international', 'remote_only')),
  contract_types public.contract_type[] not null default '{}',
  desired_salary_min integer check (desired_salary_min >= 0),
  desired_salary_max integer check (desired_salary_max >= 0),
  sectors text[] not null default '{}',
  available_from date,
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 10),
  onboarding_completed_at timestamptz,
  locale text not null default 'fr-FR',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_range check (desired_salary_max is null or desired_salary_min is null or desired_salary_max >= desired_salary_min)
);

create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles (id, first_name, last_name)
  values (
    new.id,
    left(new.raw_user_meta_data ->> 'first_name', 100),
    left(new.raw_user_meta_data ->> 'last_name', 100)
  )
  on conflict (id) do nothing;

  -- Consentements recueillis sur le formulaire d'inscription (versions des textes acceptés)
  if new.raw_user_meta_data ? 'terms_version' then
    insert into public.consent_records (user_id, consent_type, version, granted)
    values (new.id, 'terms', left(new.raw_user_meta_data ->> 'terms_version', 40), true);
  end if;
  if new.raw_user_meta_data ? 'privacy_version' then
    insert into public.consent_records (user_id, consent_type, version, granted)
    values (new.id, 'privacy', left(new.raw_user_meta_data ->> 'privacy_version', 40), true);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- CV
-- -----------------------------------------------------------------------------
create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  storage_path text check (storage_path is null or storage_path like user_id::text || '/%'),
  original_filename text,
  mime_type text check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer check (size_bytes between 1 and 5242880),
  extracted_text text,
  parsed_profile jsonb,                 -- profil structuré extrait (avec evidence/confidence)
  user_verified_at timestamptz,         -- l'utilisateur a validé l'extraction
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index resumes_user_idx on public.resumes (user_id);
create unique index resumes_one_primary on public.resumes (user_id) where is_primary;
create trigger resumes_updated_at before update on public.resumes
  for each row execute function public.set_updated_at();

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  resume_id uuid not null,
  version_no integer not null check (version_no > 0),
  label text check (char_length(label) <= 200),
  content jsonb not null,               -- sections du CV ; chaque modif IA acceptée explicitement
  accepted_changes jsonb not null default '[]',
  source_offer_id uuid,
  created_at timestamptz not null default now(),
  unique (resume_id, version_no),
  unique (id, user_id),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);
create index resume_versions_user_idx on public.resume_versions (user_id);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  normalized_name text generated always as (public.normalize_text(name)) stored,
  category public.requirement_category not null default 'skill',
  evidence text check (char_length(evidence) <= 1000),   -- extrait du CV qui démontre la compétence
  source text not null default 'resume' check (source in ('resume', 'user')),
  confidence public.confidence_level not null default 'inferred',
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);
create index skills_user_idx on public.skills (user_id);
create unique index skills_user_name_uniq on public.skills (user_id, coalesce(resume_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name);

-- -----------------------------------------------------------------------------
-- Entreprises (référentiel partagé, écriture via fonction contrôlée)
-- -----------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null,
  domain extensions.citext unique check (domain is null or domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  siren text unique check (siren is null or siren ~ '^[0-9]{9}$'),
  sector text,
  headquarters text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_normalized_trgm on public.companies using gin (normalized_name extensions.gin_trgm_ops);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

create table public.company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (company_id, normalized_alias)
);
create index company_aliases_norm_idx on public.company_aliases (normalized_alias);

-- Résolution sûre : rattache par domaine en priorité ; sans domaine, ne crée
-- jamais d'association implicite avec une entreprise homonyme ayant un domaine.
create or replace function public.resolve_company(p_name text, p_domain text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_norm text := public.normalize_company_name(p_name);
  v_domain text := nullif(lower(btrim(p_domain)), '');
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if v_norm is null then
    raise exception 'company name required';
  end if;

  if v_domain is not null then
    select id into v_id from public.companies where domain = v_domain::extensions.citext;
    if v_id is null then
      insert into public.companies (name, normalized_name, domain)
      values (left(btrim(p_name), 200), v_norm, v_domain) returning id into v_id;
    end if;
  else
    -- Uniquement une entreprise sans domaine connu portant exactement ce nom normalisé.
    select id into v_id from public.companies
      where normalized_name = v_norm and domain is null
      order by created_at limit 1;
    if v_id is null then
      insert into public.companies (name, normalized_name)
      values (left(btrim(p_name), 200), v_norm) returning id into v_id;
    end if;
  end if;

  insert into public.company_aliases (company_id, alias, normalized_alias)
  values (v_id, left(btrim(p_name), 200), v_norm)
  on conflict (company_id, normalized_alias) do nothing;

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Offres et critères
-- -----------------------------------------------------------------------------
create table public.job_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  company_name text not null check (char_length(company_name) between 1 and 200),
  title text not null check (char_length(title) between 1 and 300),
  description text not null check (char_length(description) <= 50000),
  url text check (url is null or url ~* '^https?://'),
  location text,
  department text,
  salary_text text,
  contract_type public.contract_type,
  extracted jsonb,                      -- extraction IA validée (avec evidence)
  coverage_score numeric(5,2) check (coverage_score between 0 and 100),
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index job_offers_user_idx on public.job_offers (user_id, created_at desc);
create trigger job_offers_updated_at before update on public.job_offers
  for each row execute function public.set_updated_at();

alter table public.resume_versions
  add foreign key (source_offer_id, user_id) references public.job_offers (id, user_id) on delete set null (source_offer_id);

create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  offer_id uuid not null,
  kind public.requirement_kind not null,
  category public.requirement_category not null,
  label text not null check (char_length(label) between 1 and 300),
  offer_evidence text check (char_length(offer_evidence) <= 1000),  -- extrait de l'offre
  coverage public.coverage_state not null default 'unknown',
  resume_evidence text check (char_length(resume_evidence) <= 1000), -- extrait du CV qui le démontre
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (offer_id, user_id) references public.job_offers (id, user_id) on delete cascade
);
create index job_requirements_offer_idx on public.job_requirements (offer_id);

-- -----------------------------------------------------------------------------
-- Candidatures (CRM)
-- -----------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_id uuid,
  company_id uuid references public.companies (id) on delete set null,
  company_name text not null check (char_length(company_name) between 1 and 200),
  job_title text not null check (char_length(job_title) between 1 and 300),
  offer_url text check (offer_url is null or offer_url ~* '^https?://'),
  location text,
  salary_text text,
  contract_type public.contract_type,
  status public.application_status not null default 'to_analyze',
  channel public.application_channel,
  applied_at date,
  resume_version_id uuid,
  notes text check (char_length(notes) <= 20000),
  next_action text check (char_length(next_action) <= 500),
  next_action_at timestamptz,
  dedupe_key text generated always as (
    coalesce(public.normalize_company_name(company_name), '') || '|' || coalesce(public.normalize_text(job_title), '')
  ) stored,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (offer_id, user_id) references public.job_offers (id, user_id) on delete set null (offer_id),
  foreign key (resume_version_id, user_id) references public.resume_versions (id, user_id) on delete set null (resume_version_id),
  constraint applied_requires_sent_status check (
    applied_at is not null or status in ('to_analyze', 'to_prepare', 'ready_to_send', 'withdrawn')
  )
);
create index applications_user_status_idx on public.applications (user_id, status) where archived_at is null;
create index applications_user_next_action_idx on public.applications (user_id, next_action_at) where archived_at is null;
create index applications_dedupe_idx on public.applications (user_id, dedupe_key);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  type text not null check (type in (
    'created', 'status_changed', 'note', 'follow_up_sent', 'response_received',
    'interview', 'feedback', 'offer_updated', 'reminder')),
  from_status public.application_status,
  to_status public.application_status,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index application_events_app_idx on public.application_events (application_id, occurred_at desc);

-- Historisation automatique des changements de statut
create or replace function public.log_application_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (user_id, application_id, type, to_status)
    values (new.user_id, new.id, 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into public.application_events (user_id, application_id, type, from_status, to_status)
    values (new.user_id, new.id, 'status_changed', old.status, new.status);
  end if;
  return new;
end $$;

create trigger applications_status_log after insert or update of status on public.applications
  for each row execute function public.log_application_status();

-- -----------------------------------------------------------------------------
-- Réseau : personnes, sources, vérifications
-- -----------------------------------------------------------------------------
-- owner_user_id renseigné : fiche créée par un utilisateur (privée à lui).
-- owner_user_id null : fiche issue d'un fournisseur autorisé (écrite par le
-- service role uniquement), visible seulement des utilisateurs qui l'ont liée.
create table public.professional_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete cascade,
  first_name text check (char_length(first_name) <= 100),
  last_name text check (char_length(last_name) <= 100),
  full_name text generated always as (btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) stored,
  current_title text check (char_length(current_title) <= 300),
  company_id uuid references public.companies (id) on delete set null,
  company_name text check (char_length(company_name) <= 200),
  department text check (char_length(department) <= 200),
  work_location text check (char_length(work_location) <= 200),
  profile_url text check (profile_url is null or profile_url ~* '^https://'),
  role_type public.contact_role_type not null default 'other',
  employment_confidence public.confidence_level not null default 'unknown',
  last_verified_at timestamptz,
  retention_until timestamptz not null default (now() + interval '12 months'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint has_identity check (coalesce(first_name, last_name, current_title) is not null)
);
-- Volontairement : aucune colonne pour téléphone personnel ou email privé.
create index professional_contacts_owner_idx on public.professional_contacts (owner_user_id);
create index professional_contacts_company_idx on public.professional_contacts (company_id);
create unique index professional_contacts_owner_url_uniq
  on public.professional_contacts (owner_user_id, lower(profile_url)) where profile_url is not null;
create trigger professional_contacts_updated_at before update on public.professional_contacts
  for each row execute function public.set_updated_at();

create table public.contact_sources (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.professional_contacts (id) on delete cascade,
  provider text not null check (provider in (
    'user_manual', 'user_import', 'assisted_search', 'company_site', 'licensed_provider')),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  legal_basis text not null check (legal_basis in (
    'user_provided', 'user_consented_import', 'public_professional_info', 'provider_contract')),
  added_by uuid references auth.users (id) on delete set null,
  retrieved_at timestamptz not null default now(),
  raw_excerpt text check (char_length(raw_excerpt) <= 2000)
);
create index contact_sources_contact_idx on public.contact_sources (contact_id);

create table public.contact_verifications (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.professional_contacts (id) on delete cascade,
  method text not null check (method in ('user_confirmed', 'company_page', 'provider_check', 'domain_match')),
  result public.confidence_level not null,
  note text check (char_length(note) <= 500),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz not null default now()
);
create index contact_verifications_contact_idx on public.contact_verifications (contact_id, verified_at desc);

-- Relation de l'utilisateur avec une personne (CRM réseau)
create table public.user_network_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.professional_contacts (id) on delete cascade,
  status public.network_contact_status not null default 'identified',
  do_not_contact boolean generated always as (status = 'do_not_contact') stored,
  has_mutual_connection boolean not null default false,
  mutual_connection_note text check (char_length(mutual_connection_note) <= 500),
  is_alumni boolean not null default false,
  notes text check (char_length(notes) <= 10000),
  follow_up_count smallint not null default 0 check (follow_up_count >= 0),
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_id),
  unique (id, user_id)
);
create index user_network_contacts_status_idx on public.user_network_contacts (user_id, status);
create trigger user_network_contacts_updated_at before update on public.user_network_contacts
  for each row execute function public.set_updated_at();

create table public.application_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  network_contact_id uuid not null,
  relevance_score smallint check (relevance_score between 0 and 100),
  score_breakdown jsonb,                -- critères + justifications
  potential_relation text check (char_length(potential_relation) <= 300),
  strategy public.contact_strategy,
  created_at timestamptz not null default now(),
  unique (application_id, network_contact_id),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade,
  foreign key (network_contact_id, user_id) references public.user_network_contacts (id, user_id) on delete cascade
);
create index application_contacts_app_idx on public.application_contacts (application_id, relevance_score desc);

create table public.networking_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  network_contact_id uuid not null,
  application_id uuid,
  type text not null check (type in ('message_sent', 'reply_received', 'call', 'meeting', 'intro_requested', 'intro_made', 'note')),
  channel text check (channel in ('linkedin', 'email', 'phone', 'in_person', 'other')),
  summary text check (char_length(summary) <= 5000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (network_contact_id, user_id) references public.user_network_contacts (id, user_id) on delete cascade,
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete set null (application_id)
);
create index networking_interactions_contact_idx on public.networking_interactions (network_contact_id, occurred_at desc);

create table public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  network_contact_id uuid,
  application_id uuid,
  recipient_type public.message_recipient_type not null,
  tone public.message_tone not null default 'professional',
  purpose text not null check (purpose in ('first_contact', 'follow_up', 'thank_you', 'intro_request', 'application_follow_up')),
  subject text check (char_length(subject) <= 300),
  body text not null check (char_length(body) between 1 and 5000),
  generated_by_ai boolean not null default false,
  copied_at timestamptz,               -- l'utilisateur a copié le message (envoi manuel)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (network_contact_id, user_id) references public.user_network_contacts (id, user_id) on delete cascade,
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index message_drafts_user_idx on public.message_drafts (user_id, created_at desc);
create trigger message_drafts_updated_at before update on public.message_drafts
  for each row execute function public.set_updated_at();

-- Empêche toute préparation de message vers un contact « Ne plus contacter »
create or replace function public.guard_do_not_contact()
returns trigger language plpgsql as $$
begin
  if new.network_contact_id is not null and exists (
    select 1 from public.user_network_contacts
    where id = new.network_contact_id and status = 'do_not_contact'
  ) then
    raise exception 'contact marked as do_not_contact' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger message_drafts_dnc_guard before insert on public.message_drafts
  for each row execute function public.guard_do_not_contact();

-- -----------------------------------------------------------------------------
-- Rappels, recommandations, entretiens
-- -----------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid,
  network_contact_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  due_at timestamptz not null,
  completed_at timestamptz,
  notify_email boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade,
  foreign key (network_contact_id, user_id) references public.user_network_contacts (id, user_id) on delete cascade
);
create index reminders_due_idx on public.reminders (user_id, due_at) where completed_at is null;

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  for_date date not null default current_date,
  kind text not null check (kind in (
    'follow_up_application', 'finalize_resume', 'contact_person', 'prepare_interview',
    'verify_offer', 'reconnect_recruiter', 'reply_message', 'close_application')),
  priority smallint not null check (priority between 1 and 100),
  title text not null check (char_length(title) <= 300),
  reason text not null check (char_length(reason) <= 1000),   -- justification affichée
  application_id uuid,
  network_contact_id uuid,
  status public.recommendation_status not null default 'pending',
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade,
  foreign key (network_contact_id, user_id) references public.user_network_contacts (id, user_id) on delete cascade
);
create index recommendations_day_idx on public.recommendations (user_id, for_date, priority desc);

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid,
  mode text not null default 'text' check (mode in ('text', 'voice')),
  scheduled_at timestamptz,
  prep jsonb,                           -- questions probables, STAR, questions à poser
  transcript jsonb not null default '[]',
  feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_id, user_id) references public.applications (id, user_id) on delete cascade
);
create index interview_sessions_user_idx on public.interview_sessions (user_id, created_at desc);
create trigger interview_sessions_updated_at before update on public.interview_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Offres commerciales, droits, paiements
-- -----------------------------------------------------------------------------
create table public.plans (
  code text primary key check (code in ('free', 'pro', 'premium')),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency char(3) not null default 'EUR',
  duration_days integer check (duration_days > 0),       -- null = sans limite (free)
  is_recurring boolean not null default false,            -- false : forfait à durée fixe
  quotas jsonb not null,
  stripe_price_id text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.plans (code, name, price_cents, duration_days, quotas) values
  ('free', 'Free', 0, null,
    '{"offer_analyses": 3, "tracked_applications": 5, "ai_follow_ups": 2, "network_searches_per_day": 2, "interview_coach": false}'),
  ('pro', 'Pro', 1900, 30,
    '{"offer_analyses": 30, "tracked_applications": null, "ai_follow_ups": null, "network_searches_per_day": 10, "interview_coach": false}'),
  ('premium', 'Premium', 4900, 30,
    '{"offer_analyses": 100, "tracked_applications": null, "ai_follow_ups": null, "network_searches_per_day": 25, "interview_coach": true}');

-- Droit d'accès acheté (forfait 30 jours ou abonnement explicite)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status public.entitlement_status not null default 'active',
  is_recurring boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_valid check (ends_at is null or ends_at > starts_at)
);
create index subscriptions_active_idx on public.subscriptions (user_id, ends_at) where status = 'active';
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,   -- conservé pour obligations comptables
  subscription_id uuid references public.subscriptions (id) on delete set null,
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  amount_cents integer not null check (amount_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  currency char(3) not null default 'EUR',
  status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  invoice_url text,
  withdrawal_waiver_at timestamptz,     -- renonciation expresse au droit de rétractation
  created_at timestamptz not null default now(),
  constraint refund_le_amount check (refunded_cents <= amount_cents)
);
create index payments_user_idx on public.payments (user_id, created_at desc);

create table public.stripe_events (
  id text primary key,                  -- event.id Stripe : idempotence
  type text not null,
  processed_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Usage IA, audit, consentements, suppression, jobs
-- -----------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_micros bigint not null default 0,    -- coût estimé en millionièmes d'euro
  success boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_feature_idx on public.ai_usage (user_id, feature, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}',     -- jamais de contenu de CV/message
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null check (consent_type in ('terms', 'privacy', 'contact_import', 'marketing_emails', 'ai_processing')),
  version text not null,
  granted boolean not null,
  recorded_at timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, consent_type, recorded_at desc);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                    -- pas de FK : la ligne survit à la suppression du compte
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'canceled')),
  processed_at timestamptz
);
create unique index deletion_requests_one_pending on public.deletion_requests (user_id) where status in ('pending', 'processing');

create table public.jobs (
  id bigint generated always as identity primary key,
  type text not null,
  user_id uuid references auth.users (id) on delete cascade,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts smallint not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_queue_idx on public.jobs (run_after) where status = 'queued';
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.user_profiles enable row level security;

-- Tables possédées directement par l'utilisateur (user_id)
do $$
declare t text;
begin
  foreach t in array array[
    'resumes', 'resume_versions', 'skills', 'job_offers', 'job_requirements',
    'applications', 'application_events', 'user_network_contacts', 'application_contacts',
    'networking_interactions', 'message_drafts', 'reminders', 'recommendations',
    'interview_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "%1$s_owner_all" on public.%1$I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Profil : lecture et mise à jour de son seul profil ; is_admin non modifiable
create policy user_profiles_select on public.user_profiles for select to authenticated
  using (id = (select auth.uid()));
create policy user_profiles_update on public.user_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Personnes : fiche privée de l'utilisateur, ou fiche fournisseur qu'il a liée
alter table public.professional_contacts enable row level security;
-- Fonction security definer : évite la récursion de policies entre
-- professional_contacts et user_network_contacts.
create or replace function public.user_has_linked_contact(p_contact_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_network_contacts u
    where u.contact_id = p_contact_id and u.user_id = auth.uid())
$$;
revoke execute on function public.user_has_linked_contact(uuid) from public, anon;
grant execute on function public.user_has_linked_contact(uuid) to authenticated;

create policy professional_contacts_select on public.professional_contacts for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or (owner_user_id is null and public.user_has_linked_contact(id))
  );
create policy professional_contacts_insert on public.professional_contacts for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy professional_contacts_update on public.professional_contacts for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy professional_contacts_delete on public.professional_contacts for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- Le lien CRM ne peut viser qu'une fiche visible par l'utilisateur
create or replace function public.can_see_contact(p_contact_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.professional_contacts pc
    where pc.id = p_contact_id
      and (pc.owner_user_id = auth.uid()
           or (pc.owner_user_id is null and exists (
             select 1 from public.user_network_contacts u
             where u.contact_id = pc.id and u.user_id = auth.uid())))
  )
$$;

create or replace function public.owns_contact(p_contact_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.professional_contacts pc
                 where pc.id = p_contact_id and pc.owner_user_id = auth.uid())
$$;
revoke execute on function public.owns_contact(uuid) from public, anon;
grant execute on function public.owns_contact(uuid) to authenticated;

create policy user_network_contacts_contact_visible on public.user_network_contacts
  as restrictive for insert to authenticated
  with check (public.owns_contact(contact_id));

alter table public.contact_sources enable row level security;
create policy contact_sources_select on public.contact_sources for select to authenticated
  using (public.can_see_contact(contact_id));
create policy contact_sources_insert on public.contact_sources for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and provider in ('user_manual', 'user_import', 'assisted_search', 'company_site')
    and exists (select 1 from public.professional_contacts pc
                where pc.id = contact_id and pc.owner_user_id = (select auth.uid())));

alter table public.contact_verifications enable row level security;
create policy contact_verifications_select on public.contact_verifications for select to authenticated
  using (public.can_see_contact(contact_id));
create policy contact_verifications_insert on public.contact_verifications for insert to authenticated
  with check (
    verified_by = (select auth.uid())
    and method = 'user_confirmed'
    and exists (select 1 from public.professional_contacts pc
                where pc.id = contact_id and pc.owner_user_id = (select auth.uid())));

-- Référentiel entreprises : lecture seule (écriture via resolve_company)
alter table public.companies enable row level security;
alter table public.company_aliases enable row level security;
create policy companies_read on public.companies for select to authenticated using (true);
create policy company_aliases_read on public.company_aliases for select to authenticated using (true);

-- Offres commerciales : lisibles par tous (page tarifs)
alter table public.plans enable row level security;
create policy plans_read on public.plans for select to anon, authenticated using (active);

-- Droits et paiements : lecture de ses seules lignes, écriture service role
alter table public.subscriptions enable row level security;
create policy subscriptions_read_own on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
alter table public.payments enable row level security;
create policy payments_read_own on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

-- Consentements : append-only
alter table public.consent_records enable row level security;
create policy consent_records_read_own on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()));
create policy consent_records_insert_own on public.consent_records for insert to authenticated
  with check (user_id = (select auth.uid()));

alter table public.deletion_requests enable row level security;
create policy deletion_requests_read_own on public.deletion_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy deletion_requests_insert_own on public.deletion_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

-- Usage IA : lecture de son propre usage (quotas)
alter table public.ai_usage enable row level security;
create policy ai_usage_read_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Service role uniquement (RLS activée, aucune policy)
alter table public.audit_logs enable row level security;
alter table public.stripe_events enable row level security;
alter table public.jobs enable row level security;
alter table public.feature_flags enable row level security;

-- =============================================================================
-- Privilèges de colonnes et rôles
-- =============================================================================
revoke all on all tables in schema public from anon;
grant select on public.plans to anon;

-- Le profil ne peut pas s'auto-promouvoir administrateur
revoke update on public.user_profiles from authenticated;
grant update (
  first_name, last_name, target_job, experience_years, experience_level, location, mobility,
  contract_types, desired_salary_min, desired_salary_max, sectors, available_from,
  onboarding_step, onboarding_completed_at, locale
) on public.user_profiles to authenticated;
revoke insert, delete on public.user_profiles from authenticated;

-- Écritures réservées au service role
revoke insert, update, delete on public.companies, public.company_aliases, public.plans,
  public.subscriptions, public.payments, public.ai_usage from authenticated;
revoke update, delete on public.consent_records, public.contact_sources, public.contact_verifications from authenticated;
revoke update, delete on public.deletion_requests from authenticated;

revoke execute on function public.resolve_company(text, text) from public, anon;
grant execute on function public.resolve_company(text, text) to authenticated;

-- =============================================================================
-- Fonctions utilisateur
-- =============================================================================

-- Droits actifs (plan courant), calculés côté base pour éviter toute falsification client
create or replace function public.current_plan(p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.plan_code from public.subscriptions s
    join public.plans p on p.code = s.plan_code
    where s.user_id = p_user and s.status = 'active'
      and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
    order by p.price_cents desc limit 1
  ), 'free')
$$;
revoke execute on function public.current_plan(uuid) from public, anon;
grant execute on function public.current_plan(uuid) to authenticated;

-- Export RGPD : toutes les données de l'appelant (security invoker → RLS appliquée)
create or replace function public.export_my_data()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'is_admin' from public.user_profiles p where p.id = auth.uid()),
    'resumes', coalesce((select jsonb_agg(to_jsonb(r)) from public.resumes r), '[]'),
    'resume_versions', coalesce((select jsonb_agg(to_jsonb(r)) from public.resume_versions r), '[]'),
    'skills', coalesce((select jsonb_agg(to_jsonb(s)) from public.skills s), '[]'),
    'job_offers', coalesce((select jsonb_agg(to_jsonb(o)) from public.job_offers o), '[]'),
    'job_requirements', coalesce((select jsonb_agg(to_jsonb(o)) from public.job_requirements o), '[]'),
    'applications', coalesce((select jsonb_agg(to_jsonb(a)) from public.applications a), '[]'),
    'application_events', coalesce((select jsonb_agg(to_jsonb(e)) from public.application_events e), '[]'),
    'professional_contacts', coalesce((select jsonb_agg(to_jsonb(c)) from public.professional_contacts c where c.owner_user_id = auth.uid()), '[]'),
    'network_contacts', coalesce((select jsonb_agg(to_jsonb(n)) from public.user_network_contacts n), '[]'),
    'application_contacts', coalesce((select jsonb_agg(to_jsonb(n)) from public.application_contacts n), '[]'),
    'networking_interactions', coalesce((select jsonb_agg(to_jsonb(i)) from public.networking_interactions i), '[]'),
    'message_drafts', coalesce((select jsonb_agg(to_jsonb(m)) from public.message_drafts m), '[]'),
    'reminders', coalesce((select jsonb_agg(to_jsonb(r)) from public.reminders r), '[]'),
    'recommendations', coalesce((select jsonb_agg(to_jsonb(r)) from public.recommendations r), '[]'),
    'interview_sessions', coalesce((select jsonb_agg(to_jsonb(i)) from public.interview_sessions i), '[]'),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(s)) from public.subscriptions s), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.payments p), '[]'),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.consent_records c), '[]')
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Rétention : purge des fiches de tiers expirées et non rattachées à une candidature active
create or replace function public.purge_expired_third_party_contacts()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.professional_contacts pc
  where pc.retention_until < now()
    and not exists (
      select 1 from public.user_network_contacts unc
      join public.application_contacts ac on ac.network_contact_id = unc.id
      join public.applications a on a.id = ac.application_id
      where unc.contact_id = pc.id
        and a.archived_at is null
        and a.status not in ('rejected', 'withdrawn', 'accepted')
    );
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.can_see_contact(uuid) from public, anon;
grant execute on function public.can_see_contact(uuid) to authenticated;
revoke execute on function public.purge_expired_third_party_contacts() from public, anon, authenticated;
