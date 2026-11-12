# RELANCE — Network Intelligence Engine

Le cœur différenciant : à partir d'une offre, aider le candidat à identifier les personnes susceptibles de lui ouvrir une conversation dans l'entreprise, **sans jamais inventer de profil ni collecter de données illégalement**.

## 1. Trois niveaux de disponibilité

| Niveau | Fonctionnement | Statut |
|---|---|---|
| **1. Recherche assistée** | Relance génère des requêtes ciblées (entreprise × métier × service) que l'utilisateur ouvre lui-même sur les plateformes ; il colle/saisit les profils qu'il retient, Relance les structure et les classe. | MVP |
| **2. Découverte intégrée** | Fournisseurs de données professionnels sous contrat, affichage direct de collaborateurs vérifiés. | Après validation juridique, coûts et droits de réutilisation |
| **3. Intelligence relationnelle** | Croisement contacts vérifiés × réseau importé × candidatures pour suggérer les meilleures introductions. | Après MVP |

Ce qui est **exclu** : scraper LinkedIn ou toute plateforme, contournement de limites techniques, collecte massive, hypothèse qu'une API LinkedIn permet la recherche libre de collaborateurs (ce n'est pas le cas).

## 2. Pipeline

```
Offre ─► 1. Identification entreprise ─► 2. Résolution entité (company + aliases)
     ─► 3. Interrogation des fournisseurs autorisés (ContactProvider[])
     ─► 4. Vérification d'appartenance (pas de rattachement sur simple homonymie)
     ─► 5. Scoring de pertinence (0-100, explicable)
     ─► 6. Choix de stratégie (collègue / manager / recruteur)
     ─► 7. Messages proposés, envoi par l'utilisateur
```

### 2.1 Identification de l'entreprise

Extraits de l'offre : nom, domaine officiel, secteur, localisation, service, métier, équipe potentielle, technologies.

Normalisation : minuscules, suppression des accents et des formes juridiques (SA, SAS, SASU, SARL, Group, Groupe…), espaces compactés. La clé de rapprochement prioritaire est le **domaine officiel**, puis le SIREN si fourni, puis le nom normalisé. Deux entreprises de même nom normalisé mais de domaines différents restent **distinctes** et l'utilisateur confirme le rattachement.

### 2.2 Fournisseurs (architecture modulaire)

```ts
interface ContactProvider {
  id: string;                         // 'user_manual' | 'user_import' | 'company_site' | ...
  legalBasis: LegalBasis;             // documentée par fournisseur
  isAvailable(): Promise<boolean>;
  search(q: ContactQuery): Promise<ProviderContact[]>;   // résultats bruts + provenance
}
```

Fournisseurs MVP :
- `user_manual` : saisie manuelle d'un profil consulté par l'utilisateur ;
- `user_import` : import CSV de contacts (export de son propre réseau), avec consentement enregistré ;
- `assisted_search` : génère les liens de recherche, ne récupère rien automatiquement ;
- `company_site` : pages équipe officielles consultées par l'utilisateur, qui **colle leur texte** (Relance n'ouvre pas la page) ; extraction des noms/fonctions, sélection explicite, URL et date conservées.

Chaque contact conserve `contact_sources` (fournisseur, URL, date) et `contact_verifications` (méthode, date, résultat).

### 2.3 Score de pertinence (0-100)

Pondération par défaut, configurable (`config/network-weights.ts`, surchargeable en base) :

| Critère | Poids |
|---|---|
| Proximité du poste | 30 % |
| Proximité du service | 25 % |
| Rôle dans le recrutement | 20 % |
| Connexion commune déclarée | 15 % |
| Proximité géographique | 10 % |

Chaque critère produit une valeur 0..1 **et une justification textuelle**. Un critère dont la donnée est inconnue vaut 0 et est affiché « inconnu », jamais estimé.

Le score mesure la **pertinence pour une prise de contact**, pas une probabilité de recommandation. Aucune caractéristique personnelle sensible (âge, genre, origine, etc.) n'entre dans le calcul ni n'est stockée.

### 2.4 Stratégies

1. **Futur collègue** — s'informer sur le métier, l'équipe, le processus.
2. **Manager pertinent** — présenter brièvement son intérêt, sans présumer qu'il décide.
3. **Recruteur** — exprimer son intérêt et poser des questions précises.

Sélection : recruteur identifié et candidature non envoyée → 3 ; collègue avec connexion commune → 1 ; manager du service avec forte proximité → 2 ; sinon le contact de score maximal détermine la stratégie.

### 2.5 Messages

Destinataires : collègue, manager, recruteur, ancien élève, contact commun, intermédiaire d'introduction. Tons : professionnel, direct, chaleureux, formel.

Contraintes vérifiées après génération : longueur maximale (≈ 600 caractères pour une note de connexion, 1 200 pour un message), présence d'une demande simple, absence de familiarité inventée (« comme nous en avons parlé », « notre ami commun » sans connexion enregistrée → rejet et régénération).

## 3. Garde-fous anti-abus

- Quotas par plan sur le nombre de recherches réseau et de fiches créées par jour.
- Pas d'énumération : on recherche **par candidature**, jamais un annuaire complet d'une entreprise.
- Statut « Ne plus contacter » bloquant : aucune recommandation ni génération de message vers ce contact.
- Limitation des relances : la Next Best Action ne propose pas de relancer un contact plus de 2 fois sans réponse.
- Rétention : les fiches de tiers non rattachées à une candidature active sont supprimées après **12 mois** ; les sources sont historisées.

## 4. Interface « Personnes à contacter »

Onglet de chaque candidature : fonction, relation potentielle au poste, score + critères, source, lien profil, date de vérification, boutons « Préparer un message » et « Ajouter à mon réseau ».

État vide (obligatoire, jamais de faux profils) :
> Aucun contact vérifié trouvé pour le moment.

Suivi de : recherche assistée · import de contacts · pages officielles de l'entreprise · recherche manuelle sur les plateformes autorisées.
