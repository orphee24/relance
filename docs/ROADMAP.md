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

## Phase 3 — Offres et analyses
- ✅ Saisie de l'offre par copier-coller (le lien est conservé pour référence, jamais récupéré automatiquement)
- ✅ Extraction déterministe des critères : sections, obligatoire/souhaité, 8 catégories, contrat, salaire — y compris offres sans intitulés
- ✅ Comparaison au CV **vérifié** : outils/compétences (termes exacts, sans confusion de sous-mots), durée d'expérience (chevauchements comptés une fois), niveau **et spécialité** du diplôme, langue et niveau
- ✅ Score de couverture explicable (obligatoire ×3, souhaité ×1, partiel ½) ; chaque critère avec son explication et les extraits offre/CV
- ✅ Suggestions vérifiables, acceptées ou refusées une par une ; version de CV adaptée rattachée à l'offre, puis réanalyse ; CV d'origine intact
- ✅ Quotas infalsifiables (journal non modifiable par l'utilisateur, consommation atomique, restitution en cas d'échec)
- ✅ Résolution d'entreprise : jamais à partir du domaine d'un site d'emploi
- 🟡 Extraction et comparaison par IA : adaptateur et ancrage testés avec réponses simulées, **jamais appelés réellement**
- 🟡 Enregistrement des analyses et parcours complet : **non testés contre un vrai projet Supabase**
- ✅ Tests : 89 unitaires, 38 E2E, 3 suites SQL

### Décisions à valider
- Quota Free : 3 analyses sur **30 jours glissants** (le brief ne précisait pas la période). Forfaits payants : sur la période du forfait.
- Le niveau d'expérience compte toute l'expérience datée ; le domaine (« en product design ») n'est pas vérifié automatiquement, et l'explication le dit.

### Limites connues
- Sans IA, un synonyme (« Sketch » pour « Figma ») n'est pas reconnu : le critère apparaît non démontré.
- Les qualités personnelles sont marquées « Indéterminé » plutôt que « Non démontré ».

## Phase 4 — CRM de candidatures
- ✅ Création manuelle, ou en un clic depuis une offre analysée (offre, entreprise et version de CV rattachées)
- ✅ Détection des doublons (entreprise + intitulé normalisés) : avertissement, l'utilisateur décide
- ✅ Vue liste (recherche, filtres par étape et canal, tri, archives) et vue Kanban (glisser-déposer + menu de statut accessible au clavier, mise à jour optimiste)
- ✅ Changement de statut par fonction SQL : historique automatique, date d'envoi renseignée au premier envoi ; « Refusée » demande une confirmation explicite
- ✅ Délai depuis l'envoi affiché comme un fait (« Envoyée il y a 12 jours ») ; « Sans réponse » rappelé comme distinct d'un refus
- ✅ Fiche candidature : informations modifiables, historique et notes, prochaine action, rappels (fait / rouvrir), liens vers l'analyse et le CV, archivage, suppression confirmée
- ✅ Limite Free de 5 candidatures suivies imposée par la base (archiver libère une place)
- ✅ Export CSV pour Excel (séparateur « ; », protection contre l'injection de formules) et agenda .ics (rappels et prochaines actions)
- ✅ Encart « Personnes à contacter » avec l'état vide de la spécification (phase 5)
- 🟡 Parcours complets : **non testés contre un vrai projet Supabase** (logique SQL testée ; écrans vérifiés sur données fictives)
- ✅ Tests : 104 unitaires, 46 E2E, 4 suites SQL

### Limites connues
- La recherche est sensible aux accents (« Societe » ne trouve pas « Société »).
- L'agenda .ics est un export ponctuel, pas un abonnement synchronisé.
- Les heures des rappels utilisent le décalage horaire du jour de saisie (écart d'une heure possible autour d'un changement d'heure).

## Phase 5 — Network Intelligence Engine (niveau 1)
- ✅ Onglet « Personnes à contacter » sur chaque candidature : classement par pertinence, détail des 5 critères (inconnu = non compté, affiché comme tel), stratégie suggérée (règles §2.4), état vide sans faux profil
- ✅ Recherche assistée : 6 requêtes ciblées (collègues, managers, recruteurs, page équipe) ouvertes par l'utilisateur dans ses comptes ; Relance ne lance aucune requête
- ✅ Saisie d'une personne (fonction, service, lieu, lien de profil, connexion commune) ; rôle déduit de la fonction ; score calculé au rattachement
- ✅ Page « équipe » officielle : texte collé par l'utilisateur, extraction nom/fonction, sélection explicite avant enregistrement, source et date conservées
- ✅ Import consenti des relations (CSV LinkedIn ou équivalent) : emails ignorés, liens non https écartés, doublons détectés, consentement journalisé, quota quotidien
- ✅ Suggestions « Dans votre réseau chez … » : rapprochement uniquement sur nom d'entreprise normalisé identique, à confirmer
- ✅ Fiche personne : sources et base légale, vérifications datées (« à revérifier » après 6 mois), statut, échanges (statut mis à jour automatiquement), notes, suppression avec sources
- ✅ « Ne plus contacter » bloquant (base) ; alerte après 2 relances sans réponse
- ✅ Anti-collecte : 50 fiches saisies/extraites par jour, recherche par candidature uniquement, entreprises visibles seulement si liées aux données de l'utilisateur
- ✅ Explorer les entreprises : candidatures, personnes identifiées, recherche assistée, extraction de page équipe
- 🟡 Parcours complets : **non testés contre un vrai projet Supabase** (logique SQL et moteur testés ; écrans vérifiés sur données fictives)
- ✅ Tests : 131 unitaires, 56 E2E, 5 suites SQL

### Décisions à valider
- Quota « recherches réseau » (Free : 2/jour) appliqué aux **imports** de contacts ; la saisie et l'extraction sont plafonnées à 50 fiches/jour pour tous.
- Une personne listée sur une page officielle de l'entreprise est marquée « poste vérifié » à la date de l'extraction.
- Une relation importée compte comme « connexion commune » (relation directe) dans le score.

### Limites connues
- L'extraction de page équipe reconnaît les formats courants (« Nom — Fonction », nom puis fonction) ; les mises en page atypiques demandent une saisie manuelle.
- Le rapprochement par entreprise ne reconnaît pas les noms commerciaux différents (« Groupe X » / « X France ») : ajout manuel possible.

## Phase 6 — Messages, relances, recommandations, statistiques
- ✅ Rédaction de messages : 6 destinataires × 4 tons × 5 objets × 3 formats ; modèles construits uniquement sur des faits enregistrés (réalisation citée telle quelle depuis le CV vérifié)
- ✅ Contrôles sur chaque message (génération et édition) : longueur, demande claire, aucun échange / connexion / école commune non enregistrés, aucun champ à compléter — les 360 combinaisons de modèles testées
- ✅ Copie puis « J'ai envoyé ce message » : échange enregistré, statut du contact mis à jour ; Relance n'envoie jamais rien
- ✅ Remerciement possible seulement après un échange enregistré ; aucun message vers « Ne plus contacter » (base)
- ✅ Diagnostic des candidatures sans réponse : faits, hypothèses (présentées comme telles), inconnues, conseil daté (attendre 7 jours, 2 relances maximum, puis contact direct)
- ✅ Relances de candidature enregistrées, plafonnées à 2 par la base
- ✅ Next Best Action : 3 actions par jour (fuseau Europe/Paris), justifiées, une par candidature et par personne ; faites / écartées ne sont pas reproposées ; autres pistes
- ✅ Statistiques : taux de réponse et d'entretien, envois par semaine, taux par canal (échantillons < 5 signalés), activité réseau
- 🟡 Rédaction par IA : adaptateur testé avec réponses simulées (texte écarté s'il échoue aux contrôles), **jamais appelé réellement**
- 🟡 Parcours complets : **non testés contre un vrai projet Supabase**
- ✅ Tests : 156 unitaires, 64 E2E, 6 suites SQL

### Décisions à valider
- Quota « relances IA » (Free : 2) décompté pour toute rédaction **par IA** ; les messages par modèle sont illimités. Quota restitué si l'IA échoue ou est écartée.
- Délais : première relance à J+7, seconde 7 jours après, aucune au-delà ; « faire le point » proposé à J+45 après 2 relances.
- Le coach d'entretien (module 7) est reporté à la phase 7.

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
