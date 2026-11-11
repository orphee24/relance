import { describe, expect, it } from "vitest";
import { computeRelevance, type RelevanceInputs } from "@/server/network/relevance";

const base: RelevanceInputs = {
  roleProximity: { value: 1, reason: "Même métier : développeur back-end" },
  departmentProximity: { value: 1, reason: "Équipe Plateforme citée dans l'offre" },
  hiringRole: { value: 0.5, reason: "Manager de l'équipe" },
  mutualConnection: { value: null, reason: "" },
  geography: { value: 1, reason: "Même ville" },
};

describe("computeRelevance", () => {
  it("applique la pondération par défaut", () => {
    // 30 + 25 + 10 + 0 + 10 = 75
    expect(computeRelevance(base).score).toBe(75);
  });

  it("affiche l'information inconnue sans l'estimer", () => {
    const r = computeRelevance(base);
    const mutual = r.criteria.find((c) => c.key === "mutualConnection")!;
    expect(mutual.known).toBe(false);
    expect(mutual.points).toBe(0);
    expect(mutual.reason).toBe("Information inconnue");
    expect(r.unknownCount).toBe(1);
  });

  it("borne les valeurs hors intervalle", () => {
    const r = computeRelevance({ ...base, roleProximity: { value: 5, reason: "x" }, hiringRole: { value: -1, reason: "y" } });
    expect(r.score).toBe(65);
  });

  it("accepte des pondérations personnalisées et les normalise", () => {
    const r = computeRelevance(base, { roleProximity: 1, departmentProximity: 0, hiringRole: 0, mutualConnection: 0, geography: 0 });
    expect(r.score).toBe(100);
  });

  it("refuse des pondérations invalides", () => {
    expect(() =>
      computeRelevance(base, { roleProximity: -1, departmentProximity: 0, hiringRole: 0, mutualConnection: 0, geography: 0 }),
    ).toThrow();
  });
});
