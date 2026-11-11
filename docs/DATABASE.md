# RELANCE — Base de données

PostgreSQL 15+ (Supabase), migrations dans `supabase/migrations/`.

| Migration | Contenu |
|---|---|
| `…0001_core_schema.sql` | Types, tables, index, triggers, RLS, privilèges, fonctions métier |
| `…0002_semantic_search.sql` | pgvector : embeddings (1536 dim.), index HNSW, `match_user_skills` |
| `…0003_storage.sql` | Bucket privé `resumes`, policies par dossier `user_id/` |

## 1. Principes

1. **RLS partout.** Toute table personnelle a une policy `user_id = auth.uid()`. Les tables techniques (`jobs`, `audit_logs`, `stripe_events`, `feature_flags`) ont la RLS activée **sans** policy : seul le service role y accède.
2. **Clés étrangères composites `(id, user_id)`.** Un enfant ne peut référencer qu'un parent du même utilisateur, garanti par la base même si le code serveur se trompe.
3. **Privilèges de colonnes.** `user_profiles.is_admin` n'est pas modifiable par l'utilisateur ; le référentiel `companies`, les `plans`, `subscriptions` et `payments` ne sont écrits que par le service role.
4. **Historisation automatique.** Tout changement de statut de candidature crée un `application_events`.
5. **Pas de colonnes pour données sensibles de tiers.** Aucune colonne téléphone personnel / email privé dans `professional_contacts`.
6. **Rétention.** `professional_contacts.retention_until` (12 mois) + `purge_expired_third_party_contacts()` à planifier (cron quotidien).

## 2. Modèle

```
auth.users ─1:1─ user_profiles
   │
   ├─< resumes ─< resume_versions          skills (>─ resumes)
   ├─< job_offers ─< job_requirements
   │       └── companies ─< company_aliases     (référentiel partagé)
   ├─< applications ─< application_events
   │       ├── job_offers, resume_versions, companies
   │       └─< application_contacts >─ user_network_contacts
   ├─< professional_contacts (owner) ─< contact_sources, contact_verifications
   ├─< user_network_contacts >─ professional_contacts
   │       └─< networking_interactions, message_drafts, reminders
   ├─< recommendations, reminders, interview_sessions
   ├─< subscriptions >─ plans ; payments
   └─< ai_usage, consent_records ; deletion_requests ; jobs
```

## 3. Personnes et visibilité

- `professional_contacts.owner_user_id` **renseigné** : fiche saisie/importée par un utilisateur, **privée** à cet utilisateur.
- `owner_user_id` **null** : fiche issue d'un fournisseur sous contrat (niveau 2), écrite par le service role, visible uniquement des utilisateurs qui l'ont liée à leur CRM.
- `user_network_contacts` porte la relation de l'utilisateur (statut, notes, « Ne plus contacter », connexion commune).
- `contact_sources` historise chaque provenance avec sa base légale. Un utilisateur ne peut déclarer que des sources `user_manual`, `user_import`, `assisted_search`, `company_site`.

## 4. Entreprises

`resolve_company(name, domain)` (security definer) :
- avec domaine → rattachement par domaine (unique, insensible à la casse) ;
- sans domaine → seulement une entreprise **sans domaine** de même nom normalisé ; jamais d'association implicite à une entreprise homonyme identifiée par un domaine.

`normalize_company_name` retire accents, ponctuation et formes juridiques (SA, SAS, SARL, Groupe…). Miroir TypeScript : `src/lib/normalize.ts` (tests unitaires).

## 5. Doublons de candidatures

`applications.dedupe_key = entreprise_normalisée | intitulé_normalisé` (colonne générée, indexée). L'application signale les doublons potentiels, l'utilisateur décide.

## 6. Fonctions exposées

| Fonction | Rôle | Accès |
|---|---|---|
| `resolve_company(text, text)` | Résolution/création d'entreprise | authenticated |
| `current_plan(uuid)` | Plan actif (`free` par défaut) | authenticated |
| `export_my_data()` | Export RGPD JSON (security invoker → RLS) | authenticated |
| `match_user_skills(vector, int)` | Similarité sémantique sur ses compétences | authenticated |
| `purge_expired_third_party_contacts()` | Rétention | service role |

## 7. Suppression de compte

`deletion_requests` est créée par l'utilisateur ; un job service supprime `auth.users` (cascade sur toutes les tables personnelles), les fichiers du bucket `resumes/<user_id>/`, et conserve `payments` avec `user_id = null` pour les obligations comptables.

## 8. Tests

```bash
./supabase/tests/run-local.sh
```

Lance un Postgres jetable, applique un stub minimal de Supabase (`auth.uid()`, rôles, storage), les migrations, puis `rls_isolation_test.sql` : isolation entre deux utilisateurs, auto-promotion admin, forfait auto-attribué, résolution d'homonymes, « Ne plus contacter », export, stockage, anonyme, rétention, cascade de suppression.

Avec la CLI Supabase : `supabase db reset` applique les mêmes migrations sur la pile locale officielle.
