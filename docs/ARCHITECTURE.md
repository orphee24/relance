# RELANCE — Architecture

## 1. Vue d'ensemble

Monolithe modulaire Next.js (App Router) adossé à Supabase (Postgres + Auth + Storage). Pas de microservices : un seul déploiement, des modules métier aux frontières nettes.

```
Navigateur ──► Next.js (Vercel ou équivalent)
                 ├─ app/(marketing)      pages publiques
                 ├─ app/(auth)           connexion, inscription, reset
                 ├─ app/(app)            application authentifiée
                 ├─ app/api/*            route handlers (webhooks, jobs)
                 └─ src/server/*         services métier (server-only)
                        │
                        ├─► Supabase Postgres (RLS, pgvector)
                        ├─► Supabase Auth / Storage (CV privés)
                        ├─► Fournisseur LLM (via couche d'abstraction)
                        ├─► Stripe (Checkout + webhooks)
                        ├─► Resend (emails transactionnels)
                        └─► Sentry (erreurs)
```

## 2. Choix techniques

| Domaine | Choix | Justification |
|---|---|---|
| Framework | Next.js 15, App Router, React 19 | Server Components, Server Actions, un seul déploiement |
| Langage | TypeScript strict + `noUncheckedIndexedAccess` | Sûreté |
| UI | Tailwind CSS v4, composants style shadcn/ui (Radix), Lucide | Accessibilité Radix, design cohérent |
| Thème | `next-themes` | Mode clair/sombre sans flash |
| Données | Supabase Postgres + RLS | Isolation par utilisateur au niveau base |
| Auth | Supabase Auth via `@supabase/ssr` (cookies) | Email, vérification, reset, OAuth Google |
| Validation | Zod v4 | Entrées utilisateur et sorties LLM |
| Recherche sémantique | pgvector | Pas de base vectorielle séparée |
| Tâches longues | Table `jobs` + worker (cron Supabase / route protégée) | Simple, sans infra supplémentaire pour le MVP |
| Paiements | Stripe Checkout mode `payment` | Forfaits 30 jours à durée fixe |
| Tests | Vitest (unitaire/intégration), Playwright (E2E) | |

**Écart assumé** : les composants shadcn/ui sont écrits directement dans `src/components/ui` (c'est le modèle shadcn : le code est copié dans le dépôt) plutôt que générés via la CLI, pour garder le contrôle sur le thème émeraude.

## 3. Arborescence

```
src/
  app/
    (auth)/            connexion, inscription, mot-de-passe-oublie, ...
    (app)/             layout avec sidebar + pages applicatives
    auth/callback/     échange du code OAuth / lien email
    api/               webhooks (stripe), jobs
  components/
    ui/                primitives (button, card, input, badge, ...)
    layout/            sidebar, topbar, theme toggle
    shared/            états vides, badges de fiabilité
  lib/
    supabase/          clients browser / server / middleware
    validation/        schémas Zod partagés
    env.ts             validation des variables d'environnement
    utils.ts
  server/              (server-only) services métier par domaine
    ai/                provider abstraction, prompts, garde-fous
    cv/  offers/  applications/  network/  recommendations/  billing/
  config/              navigation, plans, pondérations
supabase/
  migrations/          SQL versionné
  seed.sql             données de démo explicitement marquées
tests/
  unit/  e2e/
```

## 4. Couche IA

```ts
interface LlmProvider {
  generateStructured<T>(req: { system: string; input: UntrustedText[]; schema: ZodType<T> }): Promise<LlmResult<T>>;
}
```

- **Sorties structurées** : chaque appel retourne du JSON validé par Zod ; en cas d'échec, une seule tentative de réparation puis erreur explicite.
- **Isolation des contenus non fiables** : le texte du CV et de l'offre est encapsulé dans des balises délimitées et traité comme donnée, jamais comme instruction (cf. `SECURITY.md`).
- **Traçabilité** : chaque champ extrait porte `evidence` (extrait source) et `confidence` (`verified` | `inferred` | `unknown`).
- **Compteur d'usage** : table `ai_usage` (tokens, coût estimé, fonctionnalité) pour quotas et administration.
- **Fournisseur par défaut** : configurable via `AI_PROVIDER` ; un `MockProvider` explicitement marqué sert aux tests.

## 5. Score de couverture CV/offre (déterministe)

Le LLM **extrait** ; le **calcul** est déterministe et testable.

```
couverture = Σ(poids_critère × état) / Σ(poids_critère)
poids : obligatoire = 3, souhaitable = 1
état  : démontré = 1, partiellement démontré = 0.5, non démontré = 0
```

Présenté comme « estimation interne de couverture », jamais comme score ATS.

## 6. Tâches asynchrones

Table `jobs (type, payload, status, attempts, run_after)` consommée par une route `/api/jobs/run` protégée par secret et appelée par un cron. Utilisée pour : extraction CV, analyse d'offre, recherche réseau, emails de rappel. Remplaçable plus tard par une file dédiée sans changer les services.

## 7. Feature flags et plans

`config/plans.ts` définit les quotas par défaut ; la table `plans` en base les surcharge (prix, quotas configurables depuis l'admin). Les droits sont calculés côté serveur (`getEntitlements(userId)`), jamais côté client.

## 8. Internationalisation

V1 en français. Les chaînes d'interface sont centralisées par module (`src/i18n/fr.ts` à venir en phase 2) ; dates et montants via `Intl` avec locale `fr-FR`.

## 9. B2B futur

Tables `organizations` / `organization_members` prévues dans la roadmap, non créées en V1. La règle d'accès sera : une organisation ne voit que des **agrégats anonymisés**, sauf partage explicite par le bénéficiaire, ressource par ressource.
