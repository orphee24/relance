import { describe, expect, it } from "vitest";
import { computeCoverage } from "@/server/analysis/coverage";

describe("computeCoverage", () => {
  it("pondère obligatoires (3) et souhaitables (1)", () => {
    const r = computeCoverage([
      { label: "TypeScript", kind: "mandatory", coverage: "demonstrated", resumeEvidence: "3 ans de TypeScript" },
      { label: "PostgreSQL", kind: "mandatory", coverage: "missing" },
      { label: "Anglais", kind: "preferred", coverage: "partial", resumeEvidence: "Anglais professionnel" },
    ]);
    // (3*1 + 3*0 + 1*0.5) / 7 = 50 %
    expect(r.score).toBe(50);
    expect(r.missingMandatory.map((m) => m.label)).toEqual(["PostgreSQL"]);
  });

  it("ne compte jamais un critère démontré sans preuve issue du CV", () => {
    const r = computeCoverage([{ label: "Kubernetes", kind: "mandatory", coverage: "demonstrated", resumeEvidence: " " }]);
    expect(r.score).toBe(0);
    expect(r.downgradedForMissingEvidence).toEqual(["Kubernetes"]);
    expect(r.notDemonstrated).toHaveLength(1);
  });

  it("retourne null sans critère exploitable", () => {
    expect(computeCoverage([]).score).toBeNull();
  });
});
