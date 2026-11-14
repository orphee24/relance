-- =============================================================================
-- Durcissement suite au conseiller de sécurité Supabase
-- =============================================================================

-- Fonctions de déclencheur : jamais appelables via l'API (les déclencheurs continuent de fonctionner).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_tracked_applications_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.log_application_status() from public, anon, authenticated;
revoke execute on function public.guard_do_not_contact() from public, anon, authenticated;

-- search_path figé (tous les objets référencés sont déjà qualifiés).
alter function public.set_updated_at() set search_path = '';
alter function public.normalize_text(text) set search_path = '';
alter function public.normalize_company_name(text) set search_path = '';
alter function public.log_application_status() set search_path = '';
alter function public.guard_do_not_contact() set search_path = '';

-- Un utilisateur connecté ne peut connaître que son propre forfait.
-- (auth.uid() null = service role ou contexte interne : autorisé.)
create or replace function public.current_plan(p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.plan_code from public.subscriptions s
    join public.plans p on p.code = s.plan_code
    where s.user_id = p_user
      and (auth.uid() is null or p_user = auth.uid())
      and s.status = 'active'
      and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
    order by p.price_cents desc limit 1
  ), 'free')
$$;
