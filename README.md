# Relance

> « Ne postulez plus dans le vide. »

Copilote de recherche d'emploi : analyse CV/offre, CRM de candidatures et **Network Intelligence Engine** pour identifier les bonnes personnes dans chaque entreprise ciblée. Marché français en priorité.

Spécifications : [`docs/`](docs) — [Produit](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Base de données](docs/DATABASE.md) · [Moteur réseau](docs/NETWORK_ENGINE.md) · [Sécurité & RGPD](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md)

## État actuel — fin de la phase 2

| Fonctionnalité | État | Détail |
|---|---|---|
| Schéma de base complet (30 tables), RLS, migrations | ✅ Vérifié | Appliqué sur Postgres 16 + pgvector ; 30+ assertions d'isolation et d'intégrité (`npm run test:db`) |
| Design system (thème émeraude, mode sombre, marqueurs de fiabilité) | ✅ Vérifié | Revu en capture clair/sombre, desktop/mobile |
| Shell applicatif, navigation latérale, responsive | ✅ Vérifié | |
| Validation des formulaires d'authentification, protection des routes, redirections sûres | ✅ Vérifié | Tests E2E Playwright (desktop + mobile) |
| Inscription, connexion, vérification email, mot de passe oublié/réinitialisation, déconnexion | 🟡 Code complet | **Non testé contre un vrai projet Supabase** (aucun projet configuré pour l'instant) |
| Connexion Google | 🟡 Code complet | Désactivée tant que `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false` |
| Tableau de bord (métriques, pipeline, opportunités, rappels) | 🟡 Branché sur les vraies tables | Se remplira à partir de la phase 4 ; aucune donnée fictive affichée |
| Export RGPD (JSON) | 🟡 Code complet | Fonction SQL testée ; route non testée contre Supabase réel |
| Demande de suppression de compte | 🟡 Enregistrée | **Le traitement automatique (job) est prévu en phase 8** ; d'ici là, traitement manuel par l'opérateur |
| Moteurs déterministes : couverture CV/offre, pertinence des contacts, métriques | ✅ Testés unitairement | Seront branchés en phases 3, 5 et 6 |
| Onboarding en 5 étapes | 🟡 Code complet | Validation testée ; enregistrement non testé contre Supabase réel |
| Import CV PDF/DOCX, extraction, analyse sans IA, ancrage, anti-injection, PDF | ✅ Testés | Sur fichiers générés (`tests/fixtures`, données fictives) |
| Extraction des CV par IA | 🟡 Adaptateur testé avec réponses simulées | Activé par `ANTHROPIC_API_KEY` ; jamais appelé réellement |
| Vérification du profil, versions, CV principal, export PDF | 🟡 Logique SQL et rendu PDF testés | Parcours complet non testé contre Supabase réel |
| Autres écrans (candidatures, analyse, réseau…) | ⬜ | Affichent clairement « en construction » avec leur contenu prévu |

Reporté après le MVP : coach d'entretien vocal, découverte intégrée de contacts (fournisseurs sous contrat), Relance Campus, Relance Employer.

## IA

Sans `ANTHROPIC_API_KEY`, Relance fonctionne avec son analyseur déterministe. Avec une clé, l'extraction passe par le modèle configuré (`AI_MODEL`) en sortie JSON contrainte par schéma ; le résultat est ensuite ancré dans le texte du CV, puis vérifié par l'utilisateur. Renseigner `AI_PRICE_*` d'après la grille tarifaire en vigueur pour l'estimation des coûts.

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
| `npm run test:e2e` | Build de production + Playwright (`CHROME_PATH=/chemin/vers/chrome` si les navigateurs Playwright ne sont pas installés) |
| `npm run check` | typecheck + lint + tests + build |

Les tests E2E utilisent par défaut une URL Supabase injoignable : ils couvrent validations, protections, redirections et messages d'erreur. Pour les parcours connectés, fournir un projet de test via `E2E_SUPABASE_URL` et `E2E_SUPABASE_KEY`.

## Déploiement

1. Projet Supabase de production (UE), migrations appliquées, étapes 3 à 7 ci-dessus.
2. Hébergement Next.js (Vercel région `cdg1`/`fra1`, ou conteneur Node) ; variables de `.env.example` renseignées, `NEXT_PUBLIC_SITE_URL` sur le domaine final.
3. `npm run check` vert en CI avant chaque mise en production.
4. Avant l'ouverture au public : CGU et politique de confidentialité validées juridiquement, AIPD du module réseau, SMTP dédié, Sentry, revue de sécurité (voir `docs/SECURITY.md` §6).

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
