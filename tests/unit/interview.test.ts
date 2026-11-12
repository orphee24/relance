import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInterviewPrep, starFeedback } from "@/server/interview/prep";
import { analyzeOffer } from "@/server/offers/analyze";
import { extractResumeText } from "@/server/cv/extract-text";
import { parseResumeHeuristically } from "@/server/cv/heuristic-parser";

describe("préparation d'entretien", () => {
  it("tire les questions de l'offre analysée et cite le CV tel quel", async () => {
    const cv = parseResumeHeuristically((await extractResumeText(new Uint8Array(readFileSync(new URL("../fixtures/cv-exemple.pdf", import.meta.url))))).text);
    const { analysis } = await analyzeOffer({
      offerText: readFileSync(new URL("../fixtures/offres/comptable-sans-sections.txt", import.meta.url), "utf8"),
      overrides: { title: null, company: "Groupe industriel Exemple", location: null },
      resume: { versionId: "v", label: null, profile: cv },
      provider: null,
      now: new Date("2026-11-12"),
    });
    const prep = buildInterviewPrep({ company: "Groupe industriel Exemple", jobTitle: "Comptable fournisseurs", requirements: analysis.requirements, desiredSalary: { min: 32000, max: 36000 }, offerSalary: "32 000 € à 36 000 € brut annuel" });
    const kinds = prep.questions.map((q) => q.kind);
    expect(kinds.slice(0, 4)).toEqual(["classic", "classic", "classic", "classic"]);
    expect(prep.questions.find((q) => q.kind === "gap")?.text).toMatch(/Excel/);
    expect(prep.questions.find((q) => q.kind === "gap")?.hint).toMatch(/N'affirmez pas une compétence/);
    for (const q of prep.questions.filter((q) => q.evidence)) {
      expect(JSON.stringify(cv)).toContain(q.evidence!.split("\n")[0]!.slice(0, 20));
    }
    expect(new Set(prep.questions.map((q) => q.id)).size).toBe(prep.questions.length);
    expect(prep.salary.desired?.replace(/\s/g, " ")).toBe("32 000 € – 36 000 € brut annuel");
  });

  it("commente une réponse STAR sans la juger", () => {
    expect(starFeedback({ situation: "Refonte du parcours d'inscription", task: "", action: "Nous avons testé 3 versions", result: "Conversion en hausse" })).toEqual([
      "À compléter : votre rôle ou objectif.",
      "Le résultat ne contient aucun chiffre : si vous en avez un (délai, volume, pourcentage), ajoutez-le.",
      "L'action est décrite au « nous » : précisez ce que vous avez fait vous-même.",
    ]);
    expect(starFeedback({ situation: "Refonte du parcours d'inscription", task: "J'étais responsable du design", action: "J'ai mené 12 entretiens puis prototypé", result: "+18 % de conversion en 6 mois" })).toEqual([]);
  });
});
