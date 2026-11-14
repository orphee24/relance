# Relance

> « Ne postulez plus dans le vide. »

Copilote de recherche d'emploi : analyse CV/offre, CRM de candidatures et **Network Intelligence Engine** pour identifier les bonnes personnes dans chaque entreprise ciblée. Marché français en priorité.

Spécifications : [`docs/`](docs) — [Produit](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Base de données](docs/DATABASE.md) · [Moteur réseau](docs/NETWORK_ENGINE.md) · [Sécurité & RGPD](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md)

## État actuel — fin de la phase 8

Projet Supabase de recette : `relance` (eu-central-1), 12 migrations appliquées, conseiller de sécurité revu.

| Fonctionnalité | État | Détail |
|---|---|---|
| Schéma (32 tables), RLS, migrations | ✅ Appliqué sur Supabase réel | 8 suites SQL (`npm run test:db`) ; conseiller de sécurité : seules restent des alertes attendues (fonctions protégées par contrôle interne) |
| Extraction et rédaction par IA (Anthropic) | ✅ Testé contre l'API réelle | `npm run test:live` : CV fictif extrait sans invention, consigne injectée ignorée |
| Moteurs déterministes (couverture, pertinence, métriques, recommandations) | ✅ Testés | 170 tests unitaires |
| Authentification, onboarding, CV, offres, candidatures, réseau, messages, forfaits, admin, coach | ✅ Logique testée / 🟡 parcours connecté | À valider de bout en bout sur le déploiement de recette (voir docs/DEPLOYMENT.md) |
| Suppression de compte | ✅ Job quotidien | Fichiers, compte et données supprimés ; paiements conservés anonymisés ; annulable avant traitement ; audité |
| Journal d'audit | ✅ | Exports, demandes/annulations/exécutions de suppression, forfaits, remboursements, réglages admin |
| Limitation de débit | ✅ | Connexion (IP + email), inscription, emails, appels IA ; clés hachées, aucune IP stockée |
| CSP avec nonce par requête | ✅ Vérifié en E2E | `script-src 'nonce-…' 'strict-dynamic'`, plus de `unsafe-inline` pour les scripts |
| Suivi des erreurs (Sentry) | ✅ Optionnel | Serveur uniquement, événements nettoyés (corps, cookies, emails, secrets) |
| Textes légaux (CGU, confidentialité) | ⬜ À rédiger | Pages provisoires ; validation juridique obligatoire avant ouverture |

Reporté après le MVP : coach d'entretien vocal, découverte intégrée de contacts (fournisseurs sous contrat), Relance Campus, Relance Employer.

## IA

Sans `ANTHROPIC_API_KEY`, Relance fonctionne avec son analyseur déterministe. Avec une clé, l'extraction passe par le modèle configuré (`AI_MODEL`) en sortie JSON contrainte par schéma ; le résultat est ensuite ancré dans le texte du CV, puis vérifié par l'utilisateur. Renseigner `AI_PRICE_*` d'après la grille tarifaire en vigueur pour l'estimation des coûts.

## Stripe

1. Clés de test : `STRIPE_SECRET_KEY` (`sk_test_…`).
2. Webhook : `Developers › Webhooks`, URL `<site>/api/stripe/webhook`, évènements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`. Copier le secret (`whsec_…`) dans `STRIPE_WEBHOOK_SECRET`.
3. En local : `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. `SUPABASE_SECRET_KEY` est requis : le webhook attribue les forfaits avec le service role.
5. Les prix sont ceux de la table `plans` (modifiables dans `/admin`) ; aucun produit Stripe à créer.

## Administration

Accès réservé aux comptes dont `user_profiles.is_admin = true`, à positionner manuellement en SQL (aucune interface ne permet de s'auto-promouvoir) :

```sql
update public.user_profiles set is_admin = true where id = '<uuid du compte>';
```

## Prérequis

- Node.js ≥ 20.9
- Un projet [Supabase](https://supabase.com) (région UE recommandée)
- Optionnel : CLI Supabase, Postgres 15+ local pour `npm run test:db`

## Installation

```bash
npm install
cp .env.example .env.local     # puis renseigner les valeurs
npm run dev                    # http://localhost:3000
```

Sans configuration Supabase, l'application démarre et les pages protégées redirigent vers `/configuration`.

## Supabase

1. **Migrations** — avec la CLI : `supabase link --project-ref <ref>` puis `supabase db push`. Sinon, exécuter dans l'ordre les fichiers de `supabase/migrations/` dans l'éditeur SQL.
2. **Clés** — `Project Settings > API` : URL et clé *publishable* dans `.env.local`.
3. **URLs** — `Authentication > URL Configuration` :
   - Site URL : `NEXT_PUBLIC_SITE_URL`
   - Redirect URLs : `<site>/auth/confirm`, `<site>/auth/callback`
4. **Modèles d'email** (`Authentication > Email Templates`), pour un flux compatible rendu serveur :
   - *Confirm signup* : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - *Reset password* : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reinitialiser-mot-de-passe`
   - Traduire les textes en français.
5. **Sécurité Auth** — activer « Confirm email », la protection contre les mots de passe compromis, et ajuster les rate limits (`Authentication > Rate Limits`). Configurer un SMTP (Resend) avant la mise en production : le SMTP par défaut de Supabase est limité.
6. **Google (optionnel)** — `Authentication > Providers > Google` avec un client OAuth Google, puis `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
7. **Rétention** — planifier `select public.purge_expired_third_party_contacts();` quotidiennement (pg_cron).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:db` | Migrations + suites SQL (RLS, workflow CV), une base jetable par suite (Postgres 15+ et pgvector requis) |
| `npm run test:live` | Appel réel à l'API Anthropic sur un CV fictif (nécessite `ANTHROPIC_API_KEY`, quelques centimes) |
| `npm run test:e2e` | Build de production + Playwright (`CHROME_PATH=/chemin/vers/chrome` si les navigateurs Playwright ne sont pas installés) |
| `npm run check` | typecheck + lint + tests + build |

Les tests E2E utilisent par défaut une URL Supabase injoignable : ils couvrent validations, protections, redirections et messages d'erreur. Pour les parcours connectés, fournir un projet de test via `E2E_SUPABASE_URL` et `E2E_SUPABASE_KEY`.

## Déploiement

Procédure complète (Vercel + Supabase + Stripe, variables, vérifications) : [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Structure

```
src/app/(public)      accueil, configuration, pages légales
src/app/(auth)        connexion, inscription, mots de passe, vérification + server actions
src/app/(app)         application authentifiée (sidebar)
src/app/auth          retours OAuth et liens email
src/app/api           routes API (export RGPD)
src/components        ui/ (primitives), layout/, auth/, shared/
src/server            moteurs métier (analysis, network, analytics)
src/lib               env, supabase, validation, normalisation
supabase/             migrations + tests SQL
tests/                unit/ (Vitest), e2e/ (Playwright)
```
