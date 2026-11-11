# RELANCE — Spécification produit

> « Ne postulez plus dans le vide. »

## 1. Problème

Un chercheur d'emploi envoie des dizaines de candidatures par les canaux officiels et obtient majoritairement du silence. Il ne sait pas :

- si son CV couvre réellement les critères de l'offre ;
- où en est chacune de ses candidatures ;
- qui, dans l'entreprise, pourrait lui ouvrir une conversation ;
- quoi faire aujourd'hui pour augmenter ses chances.

## 2. Promesse

Relance aide le candidat à **comprendre** ses candidatures, **améliorer** son CV sans rien inventer, **identifier** les bonnes personnes dans l'entreprise ciblée, **entrer en contact** avec elles sous son propre contrôle, et **agir** chaque jour sur les trois actions les plus utiles.

Le facteur différenciant est le **Network Intelligence Engine** (voir `NETWORK_ENGINE.md`).

## 3. Cible

- **V1 (MVP)** : candidats en France, cadres et non-cadres, en recherche active ou en veille. Interface 100 % français.
- **Plus tard** : Relance Campus (écoles, outplacement), Relance Employer (feedback recruteur vérifié). Préparés dans l'architecture, non développés avant validation du MVP.

## 4. Modules

| # | Module | Rôle | MVP |
|---|--------|------|-----|
| 1 | Analyseur CV/offre | Extraire critères, comparer au CV, score de couverture explicable | Oui |
| 2 | CRM candidatures | Suivi table + Kanban, statuts, historique, rappels | Oui |
| 3 | Network Intelligence Engine | Découvrir et classer les personnes pertinentes | Oui (niveau 1 : recherche assistée) |
| 4 | Assistant de réseautage | Stratégies de contact, messages personnalisés, CRM réseau | Oui |
| 5 | Moteur de recommandations (Next Best Action) | 3 actions prioritaires/jour, justifiées | Oui |
| 6 | Assistant de relance | Diagnostic du silence, messages de relance | Oui |
| 7 | Coach d'entretien | Questions probables, STAR, simulation texte | Partiel (texte), voix reportée |
| 8 | Tableau de bord de performance | Taux de réponse, d'entretien, par canal | Oui |
| 9 | Apprentissage sur résultats | Ajuster les pondérations à partir des résultats observés | Après MVP |

## 5. Principes non négociables

1. Ne jamais inventer de profils, coordonnées, compétences, expériences ou résultats.
2. Ne jamais prétendre connaître le motif d'un refus. « Sans réponse » n'est jamais un refus.
3. Ne jamais garantir le passage d'un ATS, un entretien ou une embauche.
4. Aucun scraping non autorisé, aucun contournement de plateforme.
5. Aucun envoi automatique à des tiers : chaque message est copié/envoyé par l'utilisateur.
6. Distinguer systématiquement **vérifié / hypothèse / inconnu** dans l'interface et dans les sorties IA.
7. Aucune donnée fictive présentée comme réelle. Les données de démonstration portent un badge « Exemple ».
8. RGPD par conception : export, suppression, consentements, rétention limitée des données de tiers.

## 6. Navigation

Tableau de bord · Mes candidatures · Analyser une offre · Explorer les entreprises · Mon réseau · Mes actions · Mes CV · Mes entretiens · Statistiques · Paramètres

Le tableau de bord répond à trois questions :
1. **Où en est ma recherche ?** — pipeline par statut, taux de réponse.
2. **Quelles sont mes meilleures opportunités ?** — candidatures actives triées par couverture et avancement.
3. **Que dois-je faire aujourd'hui ?** — 3 actions Next Best Action, chacune avec sa justification.

## 7. Onboarding

Étapes courtes avec barre de progression ; seules l'identité et le métier recherché sont obligatoires.

1. Prénom, nom
2. Métier recherché, niveau d'expérience
3. Localisation, mobilité, type de contrat
4. Secteurs, salaire souhaité (facultatif), disponibilité (facultative)
5. Import du CV → extraction → **vérification par l'utilisateur** avant enregistrement

## 8. Statuts de candidature

À analyser · À préparer · Prête à envoyer · Envoyée · Sans réponse · Relancée · Entretien programmé · Entretien effectué · Offre reçue · Refusée · Retirée · Acceptée

## 9. Statuts de contact réseau

Identifié · À contacter · Message préparé · Contacté · A répondu · Échange en cours · Introduction proposée · Introduction obtenue · Sans réponse · Ne plus contacter

## 10. Offres commerciales

| | FREE | PRO | PREMIUM |
|---|---|---|---|
| Prix | 0 € | 19 € / 30 jours (configurable) | 49 € / 30 jours (configurable) |
| Analyses d'offres | 3 | 30 | Avancées |
| Candidatures suivies | 5 | Illimité | Illimité |
| Relances IA | 2 | Oui | Oui |
| Réseau | Limité | Quotas configurables | Stratégies approfondies |
| Coach entretien | — | — | Oui |

Les forfaits 30 jours sont des **paiements uniques à durée fixe**, jamais présentés comme abonnements récurrents. Un mode abonnement pourra être ajouté en tant que produit distinct et explicitement nommé.

## 11. Critères d'acceptation du MVP

Un utilisateur peut : créer son compte · importer son CV · vérifier son profil extrait · ajouter une offre · obtenir une analyse justifiée · adapter son CV sans invention · enregistrer sa candidature · suivre son statut · recevoir une recommandation de relance · générer et copier un message · consulter « Personnes à contacter » · identifier des contacts réels quand une source autorisée existe · comprendre leur source et pertinence · ajouter un contact à son CRM · préparer une approche · suivre ses résultats · gérer son forfait · exporter ou supprimer ses données.
