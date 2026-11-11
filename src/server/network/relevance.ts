/**
 * Score de pertinence d'un contact pour une prise de contact (0-100).
 * Ce n'est PAS une probabilité de recommandation ou d'embauche.
 * Aucune caractéristique personnelle sensible n'entre dans le calcul.
 */

export interface RelevanceWeights {
  roleProximity: number;
  departmentProximity: number;
  hiringRole: number;
  mutualConnection: number;
  geography: number;
}

export const DEFAULT_RELEVANCE_WEIGHTS: RelevanceWeights = {
  roleProximity: 30,
  departmentProximity: 25,
  hiringRole: 20,
  mutualConnection: 15,
  geography: 10,
};

export const CRITERION_LABELS: Record<keyof RelevanceWeights, string> = {
  roleProximity: "Proximité du poste",
  departmentProximity: "Proximité du service",
  hiringRole: "Rôle dans le recrutement",
  mutualConnection: "Connexion commune",
  geography: "Proximité géographique",
};

/** Valeur 0..1 avec justification ; `null` = information inconnue (vaut 0, affichée « inconnu »). */
export interface CriterionInput {
  value: number | null;
  reason: string;
}

export type RelevanceInputs = Record<keyof RelevanceWeights, CriterionInput>;

export interface CriterionResult {
  key: keyof RelevanceWeights;
  label: string;
  weight: number;
  value: number | null;
  points: number;
  reason: string;
  known: boolean;
}

export interface RelevanceResult {
  score: number;
  criteria: CriterionResult[];
  unknownCount: number;
}

export function validateWeights(w: RelevanceWeights): void {
  const values = Object.values(w);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Pondérations invalides");
  if (values.reduce((a, b) => a + b, 0) <= 0) throw new Error("La somme des pondérations doit être positive");
}

export function computeRelevance(
  inputs: RelevanceInputs,
  weights: RelevanceWeights = DEFAULT_RELEVANCE_WEIGHTS,
): RelevanceResult {
  validateWeights(weights);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const keys = Object.keys(weights) as (keyof RelevanceWeights)[];

  const criteria = keys.map<CriterionResult>((key) => {
    const { value, reason } = inputs[key];
    const known = value !== null && Number.isFinite(value);
    const v = known ? Math.max(0, Math.min(1, value as number)) : 0;
    const weight = (weights[key] / total) * 100;
    return {
      key,
      label: CRITERION_LABELS[key],
      weight: Math.round(weight * 10) / 10,
      value: known ? v : null,
      points: Math.round(weight * v * 10) / 10,
      reason: known ? reason : "Information inconnue",
      known,
    };
  });

  const score = Math.round(criteria.reduce((s, c) => s + c.points, 0));
  return { score: Math.max(0, Math.min(100, score)), criteria, unknownCount: criteria.filter((c) => !c.known).length };
}
