/**
 * Score de couverture CV/offre — calcul déterministe et explicable.
 *
 * Le LLM extrait les critères et les preuves ; ce module calcule le score.
 * Il s'agit d'une ESTIMATION INTERNE, pas d'un score ATS.
 */

export type RequirementKind = "mandatory" | "preferred";
export type CoverageState = "demonstrated" | "partial" | "missing" | "unknown";

export interface RequirementCoverage {
  label: string;
  kind: RequirementKind;
  coverage: CoverageState;
  /** Extrait du CV qui démontre le critère (obligatoire si demonstrated/partial). */
  resumeEvidence?: string | null;
}

export const KIND_WEIGHT: Record<RequirementKind, number> = { mandatory: 3, preferred: 1 };
export const STATE_VALUE: Record<CoverageState, number> = { demonstrated: 1, partial: 0.5, missing: 0, unknown: 0 };

export interface CoverageResult {
  /** 0-100, ou null si aucun critère exploitable. */
  score: number | null;
  demonstrated: RequirementCoverage[];
  partial: RequirementCoverage[];
  notDemonstrated: RequirementCoverage[];
  missingMandatory: RequirementCoverage[];
  /** Critères dont l'état a été dégradé faute de preuve. */
  downgradedForMissingEvidence: string[];
}

/**
 * Un critère n'est compté comme démontré que si une preuve issue du CV est fournie :
 * on n'accorde jamais de couverture sur simple affirmation du modèle.
 */
export function computeCoverage(requirements: RequirementCoverage[]): CoverageResult {
  const downgraded: string[] = [];
  const normalized = requirements.map((r) => {
    if ((r.coverage === "demonstrated" || r.coverage === "partial") && !r.resumeEvidence?.trim()) {
      downgraded.push(r.label);
      return { ...r, coverage: "unknown" as const };
    }
    return r;
  });

  const totalWeight = normalized.reduce((s, r) => s + KIND_WEIGHT[r.kind], 0);
  const earned = normalized.reduce((s, r) => s + KIND_WEIGHT[r.kind] * STATE_VALUE[r.coverage], 0);

  return {
    score: totalWeight === 0 ? null : Math.round((earned / totalWeight) * 1000) / 10,
    demonstrated: normalized.filter((r) => r.coverage === "demonstrated"),
    partial: normalized.filter((r) => r.coverage === "partial"),
    notDemonstrated: normalized.filter((r) => r.coverage === "missing" || r.coverage === "unknown"),
    missingMandatory: normalized.filter(
      (r) => r.kind === "mandatory" && (r.coverage === "missing" || r.coverage === "unknown"),
    ),
    downgradedForMissingEvidence: downgraded,
  };
}
