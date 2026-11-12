-- =============================================================================
-- Phase 5 : réseau (niveau 1 — recherche assistée, saisie, import consenti)
-- Fonctions security invoker : la RLS de l'appelant s'applique à chaque requête.
-- =============================================================================

-- Ajoute une personne au réseau de l'utilisateur, avec sa source (base légale) et, si l'utilisateur
-- l'a confirmé, une vérification datée. Rattache éventuellement la personne à une candidature.
-- Plafond anti-collecte : 50 fiches saisies ou extraites par jour.
create or replace function public.add_network_contact(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_provider text := coalesce(p ->> 'provider', 'user_manual');
  v_url text := nullif(btrim(p ->> 'profile_url'), '');
  v_company text := nullif(btrim(p ->> 'company_name'), '');
  v_verified boolean := coalesce((p ->> 'verified')::boolean, false);
  v_contact uuid;
  v_network uuid;
  v_today integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_provider not in ('user_manual', 'assisted_search', 'company_site') then
    raise exception 'invalid provider' using errcode = '22023';
  end if;

  select count(*) into v_today from public.contact_sources
    where added_by = v_user and provider <> 'user_import' and retrieved_at >= date_trunc('day', now());
  if v_today >= 50 then
    raise exception 'contact_daily_limit' using errcode = 'P0001';
  end if;

  if v_url is not null then
    select id into v_contact from public.professional_contacts
      where owner_user_id = v_user and lower(profile_url) = lower(v_url);
  end if;

  if v_contact is null then
    insert into public.professional_contacts (
      owner_user_id, first_name, last_name, current_title, company_id, company_name, department, work_location,
      profile_url, role_type, employment_confidence, last_verified_at
    ) values (
      v_user,
      nullif(btrim(p ->> 'first_name'), ''),
      nullif(btrim(p ->> 'last_name'), ''),
      nullif(btrim(p ->> 'current_title'), ''),
      case when v_company is null then null else public.resolve_company(v_company, nullif(p ->> 'company_domain', '')) end,
      v_company,
      nullif(btrim(p ->> 'department'), ''),
      nullif(btrim(p ->> 'work_location'), ''),
      v_url,
      coalesce((p ->> 'role_type')::public.contact_role_type, 'other'),
      case when v_verified then 'verified' else 'inferred' end::public.confidence_level,
      case when v_verified then now() end
    ) returning id into v_contact;
  end if;

  insert into public.contact_sources (contact_id, provider, source_url, legal_basis, added_by, raw_excerpt)
  values (
    v_contact, v_provider, nullif(btrim(p ->> 'source_url'), ''),
    case when v_provider = 'company_site' then 'public_professional_info' else 'user_provided' end,
    v_user, left(p ->> 'raw_excerpt', 2000)
  );

  if v_verified then
    insert into public.contact_verifications (contact_id, method, result, note, verified_by)
    values (v_contact, 'user_confirmed', 'verified', left(p ->> 'verification_note', 500), v_user);
  end if;

  insert into public.user_network_contacts (user_id, contact_id, has_mutual_connection, mutual_connection_note, is_alumni, notes)
  values (
    v_user, v_contact,
    coalesce((p ->> 'has_mutual_connection')::boolean, false),
    nullif(btrim(p ->> 'mutual_connection_note'), ''),
    coalesce((p ->> 'is_alumni')::boolean, false),
    nullif(btrim(p ->> 'notes'), '')
  )
  on conflict (user_id, contact_id) do nothing;
  select id into v_network from public.user_network_contacts where user_id = v_user and contact_id = v_contact;

  if nullif(p ->> 'application_id', '') is not null then
    insert into public.application_contacts (user_id, application_id, network_contact_id, relevance_score, score_breakdown, potential_relation, strategy)
    values (
      v_user, (p ->> 'application_id')::uuid, v_network,
      (p ->> 'relevance_score')::smallint, p -> 'score_breakdown',
      left(p ->> 'potential_relation', 300), (p ->> 'strategy')::public.contact_strategy
    )
    on conflict (application_id, network_contact_id) do update
      set relevance_score = excluded.relevance_score, score_breakdown = excluded.score_breakdown,
          potential_relation = excluded.potential_relation, strategy = excluded.strategy;
  end if;

  return v_network;
end $$;
revoke execute on function public.add_network_contact(jsonb) from public, anon;
grant execute on function public.add_network_contact(jsonb) to authenticated;

-- Import des relations de l'utilisateur (export de son propre réseau), avec consentement enregistré.
-- Les doublons (même lien de profil, ou même nom dans la même entreprise) sont ignorés.
create or replace function public.import_network_contacts(p_rows jsonb, p_consent_version text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  r jsonb;
  v_contact uuid;
  v_created integer := 0;
  v_duplicates integer := 0;
  v_url text;
  v_company text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  if nullif(btrim(p_consent_version), '') is null then
    raise exception 'consent required' using errcode = '22023';
  end if;

  insert into public.consent_records (user_id, consent_type, version, granted)
  values (v_user, 'contact_import', left(p_consent_version, 40), true);

  for r in select * from jsonb_array_elements(p_rows) loop
    v_url := nullif(btrim(r ->> 'profile_url'), '');
    v_company := nullif(btrim(r ->> 'company_name'), '');
    if coalesce(nullif(btrim(r ->> 'first_name'), ''), nullif(btrim(r ->> 'last_name'), '')) is null then
      continue;
    end if;
    if (v_url is not null and exists (
          select 1 from public.professional_contacts where owner_user_id = v_user and lower(profile_url) = lower(v_url)))
       or exists (
          select 1 from public.professional_contacts
          where owner_user_id = v_user
            and public.normalize_text(full_name) = public.normalize_text(btrim(coalesce(r ->> 'first_name', '') || ' ' || coalesce(r ->> 'last_name', '')))
            and coalesce(public.normalize_company_name(company_name), '') = coalesce(public.normalize_company_name(v_company), ''))
    then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    insert into public.professional_contacts (owner_user_id, first_name, last_name, current_title, company_id, company_name, profile_url, role_type, employment_confidence)
    values (
      v_user,
      left(nullif(btrim(r ->> 'first_name'), ''), 100),
      left(nullif(btrim(r ->> 'last_name'), ''), 100),
      left(nullif(btrim(r ->> 'current_title'), ''), 300),
      case when v_company is null then null else public.resolve_company(v_company, null) end,
      left(v_company, 200),
      case when v_url ~* '^https://' then left(v_url, 500) end,
      coalesce((r ->> 'role_type')::public.contact_role_type, 'other'),
      'inferred'
    ) returning id into v_contact;

    insert into public.contact_sources (contact_id, provider, legal_basis, added_by)
    values (v_contact, 'user_import', 'user_consented_import', v_user);

    insert into public.user_network_contacts (user_id, contact_id, has_mutual_connection, mutual_connection_note)
    values (v_user, v_contact, true, 'Relation directe (import de vos contacts)');
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'duplicates', v_duplicates);
end $$;
revoke execute on function public.import_network_contacts(jsonb, text) from public, anon;
grant execute on function public.import_network_contacts(jsonb, text) to authenticated;

-- Journal d'échange avec un contact ; met à jour le statut de façon cohérente.
-- Aucun message ne peut être enregistré vers une personne « Ne plus contacter ».
create or replace function public.log_network_interaction(
  p_network_contact_id uuid,
  p_type text,
  p_channel text default null,
  p_summary text default null,
  p_application_id uuid default null
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_status public.network_contact_status;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select status into v_status from public.user_network_contacts
    where id = p_network_contact_id and user_id = v_user for update;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if v_status = 'do_not_contact' and p_type in ('message_sent', 'intro_requested', 'call', 'meeting') then
    raise exception 'contact marked as do_not_contact' using errcode = 'P0001';
  end if;

  insert into public.networking_interactions (user_id, network_contact_id, application_id, type, channel, summary)
  values (v_user, p_network_contact_id, p_application_id, p_type, p_channel, left(nullif(btrim(p_summary), ''), 5000));

  update public.user_network_contacts set
    last_interaction_at = now(),
    follow_up_count = case
      when p_type = 'message_sent' and v_status in ('contacted', 'no_response') then follow_up_count + 1
      else follow_up_count end,
    status = case p_type
      when 'message_sent' then case when v_status in ('identified', 'to_contact', 'message_ready') then 'contacted'::public.network_contact_status else v_status end
      when 'reply_received' then case when v_status in ('identified', 'to_contact', 'message_ready', 'contacted', 'no_response') then 'replied'::public.network_contact_status else v_status end
      when 'call' then 'in_conversation'::public.network_contact_status
      when 'meeting' then 'in_conversation'::public.network_contact_status
      when 'intro_requested' then 'intro_proposed'::public.network_contact_status
      when 'intro_made' then 'intro_obtained'::public.network_contact_status
      else v_status end
  where id = p_network_contact_id;
end $$;
revoke execute on function public.log_network_interaction(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.log_network_interaction(uuid, text, text, text, uuid) to authenticated;
