-- Index des clés étrangères (conseiller de performance Supabase) : accélère les suppressions
-- en cascade (suppression d'un CV, d'une candidature ou d'un compte) et les jointures.
create index if not exists application_contacts_network_idx on public.application_contacts (network_contact_id, user_id);
create index if not exists application_events_fk_idx on public.application_events (application_id, user_id);
create index if not exists applications_company_idx on public.applications (company_id);
create index if not exists applications_offer_idx on public.applications (offer_id, user_id);
create index if not exists applications_resume_version_idx on public.applications (resume_version_id, user_id);
create index if not exists contact_sources_added_by_idx on public.contact_sources (added_by);
create index if not exists contact_verifications_verified_by_idx on public.contact_verifications (verified_by);
create index if not exists interview_sessions_application_idx on public.interview_sessions (application_id, user_id);
create index if not exists job_offers_company_idx on public.job_offers (company_id);
create index if not exists job_offers_resume_version_idx on public.job_offers (resume_version_id, user_id);
create index if not exists job_requirements_fk_idx on public.job_requirements (offer_id, user_id);
create index if not exists jobs_user_idx on public.jobs (user_id);
create index if not exists message_drafts_application_idx on public.message_drafts (application_id, user_id);
create index if not exists message_drafts_network_idx on public.message_drafts (network_contact_id, user_id);
create index if not exists networking_interactions_application_idx on public.networking_interactions (application_id, user_id);
create index if not exists networking_interactions_fk_idx on public.networking_interactions (network_contact_id, user_id);
create index if not exists payments_subscription_idx on public.payments (subscription_id);
create index if not exists recommendations_application_idx on public.recommendations (application_id, user_id);
create index if not exists recommendations_network_idx on public.recommendations (network_contact_id, user_id);
create index if not exists reminders_application_idx on public.reminders (application_id, user_id);
create index if not exists reminders_network_idx on public.reminders (network_contact_id, user_id);
create index if not exists resume_versions_resume_idx on public.resume_versions (resume_id, user_id);
create index if not exists resume_versions_source_offer_idx on public.resume_versions (source_offer_id, user_id);
create index if not exists skills_resume_idx on public.skills (resume_id, user_id);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_code);
create index if not exists user_network_contacts_contact_idx on public.user_network_contacts (contact_id);
