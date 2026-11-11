# RELANCE — Roadmap

Légende : ✅ fait et vérifié · 🟡 partiel / simulé · ⬜ à faire

## Phase 1 — Fondations, authentification, design system
- ✅ Dépôt Next.js 15, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v4, ESLint
- ✅ Documentation de spécification (`docs/`)
- ✅ Schéma complet + RLS + stockage + pgvector — validé sur Postgres 16 (`npm run test:db`)
- ✅ Design system : thème émeraude, mode sombre, marqueurs de fiabilité, police auto-hébergée (aucun appel à Google Fonts)
- ✅ Shell applicatif : navigation latérale, menu mobile, bascule de thème
- ✅ En-têtes de sécurité (CSP, X-Frame-Options, HSTS en production…)
- ✅ Protection des routes, redirections sûres (anti open-redirect), messages anti-énumération
- 🟡 Inscription / connexion / vérification email / réinitialisation / Google : code complet, **non testé contre un vrai projet Supabase**
- 🟡 Tableau de bord branché sur les tables réelles (vide tant que les phases 4-6 ne sont pas livrées)
- 🟡 Export RGPD (route + fonction SQL testée) ; demande de suppression enregistrée — **traitement automatique en phase 8**
- ✅ Tests : 36 unitaires, 24 E2E (desktop + mobile), suite SQL RLS

### Écarts et décisions
- Composants de type shadcn/ui écrits dans le dépôt (pas via la CLI) pour maîtriser le thème.
- Police Schibsted Grotesk via `@fontsource` : évite de transmettre l'IP des visiteurs à Google (point RGPD connu).
- Forfaits payants = paiements uniques de 30 jours (`is_recurring = false`), conformément à la spécification.

## Phase 2 — Onboarding, profils, CV
- ✅ Onboarding en 5 étapes avec progression ; seuls l'identité et le métier sont obligatoires ; reprise depuis le tableau de bord
- ✅ Extraction de texte PDF/DOCX (type détecté par signature, 5 Mo max, scans signalés) — testée sur fichiers réels générés
- ✅ Analyseur de CV déterministe (sans IA) : identité, expériences, dates, réalisations, formation, compétences, langues
- ✅ Ancrage : tout élément sans extrait exact dans le CV est rejeté (IA comme analyseur)
- ✅ Protection anti-injection : lignes ressemblant à des consignes pour une IA retirées et signalées
- ✅ Détection des informations manquantes (contact, dates, réalisations chiffrées…)
- 🟡 Extraction par IA (Anthropic, sorties JSON contraintes par schéma) : adaptateur testé avec réponses simulées, **jamais appelé réellement** (pas de clé)
- ✅ Écran de vérification : chaque information est modifiable, retirable ; compétences acceptées/refusées une par une
- ✅ Validation atomique (fonction SQL) : nouvelle version + compétences vérifiées — testée en SQL
- ✅ Versions multiples, CV principal, suppression avec confirmation
- ✅ Export PDF de chaque version — vérifié par relecture du PDF produit
- 🟡 Upload vers le stockage privé, téléchargement de l'original par URL signée (60 s) : code complet, **non testé contre un vrai projet Supabase**
- ✅ Tests : 72 unitaires, 34 E2E, 2 suites SQL

### Limites connues
- L'analyseur déterministe lit bien les CV à une colonne ; les mises en page en colonnes ou en tableaux peuvent mélanger les sections. L'extraction IA et l'écran de vérification compensent.
- Les CV scannés (images) ne sont pas lus : pas d'OCR pour l'instant.
- Traitement synchrone dans la requête (quelques secondes) ; passage en tâche asynchrone si les temps de réponse IA l'exigent.

## Phase 3 — Offres et analyses IA
- ✅ Couche fournisseur LLM (livrée en phase 2)
- ⬜ Extraction des critères d'offre
- ⬜ Score de couverture explicable (moteur déterministe déjà écrit en phase 1 : `src/server/analysis/coverage.ts`)
- ⬜ Suggestions de modification acceptables / refusables une par une

## Phase 4 — CRM de candidatures
- ⬜ CRUD, vue table, vue Kanban, filtres, tri, recherche
- ⬜ Historique d'événements, rappels, calendrier, doublons, export CSV

## Phase 5 — Network Intelligence Engine (niveau 1)
- ⬜ Résolution d'entreprise + alias
- ⬜ Fournisseurs `user_manual`, `user_import`, `assisted_search`, `company_site`
- ⬜ Score de pertinence (moteur déjà écrit : `src/server/network/relevance.ts`)
- ⬜ Onglet « Personnes à contacter », CRM réseau

## Phase 6 — Messages, relances, recommandations
- ⬜ Générateur de messages (6 destinataires × 4 tons) avec contrôles
- ⬜ Diagnostic du silence (faits / hypothèses / inconnus)
- ⬜ Next Best Action (3/jour, justifiées)

## Phase 7 — Paiements, quotas, administration
- ⬜ Stripe Checkout (paiement unique 30 jours), webhooks, historique
- ⬜ Droits et quotas côté serveur
- ⬜ Espace admin (agrégats uniquement), feature flags

## Phase 8 — Tests, sécurité, déploiement
- ⬜ E2E Playwright des parcours critiques
- ⬜ Job de traitement des demandes de suppression (auth, fichiers, anonymisation des paiements)
- ⬜ Journal d'audit des exports et suppressions
- ⬜ Rate limiting, CSP finalisée, Sentry
- ⬜ Procédure de déploiement

## Après MVP
- Coach d'entretien avancé (voix)
- Niveau 2 réseau (fournisseurs de données sous contrat)
- Apprentissage des pondérations sur résultats
- Relance Campus, Relance Employer
- Internationalisation
