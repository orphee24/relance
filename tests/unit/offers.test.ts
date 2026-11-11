import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { extractOfferHeuristically, requiredYears } from "@/server/offers/heuristic-extractor";
import { educationLevel, matchAll, parseMonth, requirementTerms, resumeToText, totalExperienceYears } from "@/server/offers/matcher";
import { applySuggestions, buildSuggestions } from "@/server/offers/suggestions";
import { analyzeOffer } from "@/server/offers/analyze";
import { extractResumeText } from "@/server/cv/extract-text";
import { parseResumeHeuristically } from "@/server/cv/heuristic-parser";
import { emptyProfile, type ResumeProfile } from "@/lib/validation/resume-profile";
import type { LlmProvider } from "@/server/ai/provider";

const offer = (name: string) => readFileSync(new URL(`../fixtures/offres/${name}.txt`, import.meta.url), "utf8");
const NOW = new Date("2026-11-12T10:00:00Z");
let cv: ResumeProfile;

beforeAll(async () => {
  const bytes = new Uint8Array(readFileSync(new URL("../fixtures/cv-exemple.pdf", import.meta.url)));
  cv = parseResumeHeuristically((await extractResumeText(bytes)).text);
});

describe("extraction déterministe des critères", () => {
  it("lit une offre structurée en sections", () => {
    const r = extractOfferHeuristically(offer("product-designer"));
    expect(r).toMatchObject({ title: "Product Designer Senior (H/F)", contractType: "cdi", salaryText: "55 k€ - 65 k€ brut annuel" });
    expect(r.requirements.map((q) => [q.kind, q.category])).toEqual([
      ["mandatory", "experience"],
      ["mandatory", "tool"],
      ["mandatory", "skill"],
      ["mandatory", "education"],
      ["mandatory", "language"],
      ["preferred", "skill"],
      ["preferred", "tool"],
      ["preferred", "skill"],
      ["preferred", "certification"],
    ]);
    // Missions et avantages ne sont pas des critères
    expect(r.requirements.some((q) => /mutuelle|onboarding/i.test(q.label))).toBe(false);
  });

  it("lit une offre rédigée en paragraphes, sans intitulés", () => {
    const r = extractOfferHeuristically(offer("comptable-sans-sections"));
    expect(r.contractType).toBe("cdd");
    expect(r.requirements.map((q) => `${q.kind}/${q.category}`)).toEqual([
      "mandatory/education",
      "mandatory/experience",
      "mandatory/tool",
      "preferred/language",
      "mandatory/soft_skill",
    ]);
    for (const q of r.requirements) expect(offer("comptable-sans-sections")).toContain(q.offerEvidence);
  });

  it("ne rend pas facultatif un critère obligatoire assorti d'une précision", () => {
    const [req] = extractOfferHeuristically("Poste\nVotre profil\n- Au moins 5 ans d'expérience, idéalement en fintech").requirements;
    expect(req?.kind).toBe("mandatory");
  });

  it("lit les années d'expérience demandées", () => {
    expect(requiredYears("Au moins 5 ans d'expérience")).toBe(5);
    expect(requiredYears("expérience de 2 ans minimum")).toBe(2);
    expect(requiredYears("Expérience confirmée")).toBeNull();
  });
});

describe("comparaison CV/offre", () => {
  it("évalue chaque critère avec sa preuve et son explication", () => {
    const req = extractOfferHeuristically(offer("product-designer")).requirements;
    const m = matchAll(req, cv, NOW);
    expect(m.map((x) => x.coverage)).toEqual([
      "demonstrated", "demonstrated", "demonstrated", "demonstrated", "demonstrated",
      "demonstrated", "demonstrated", "partial", "missing",
    ]);
    for (const x of m.filter((x) => x.coverage === "demonstrated" || x.coverage === "partial")) {
      expect(x.resumeEvidence, x.label).toBeTruthy();
    }
    expect(m[7]!.explanation).toContain("Recherche utilisateur");
  });

  it("n'invente aucune couverture pour un profil d'un autre métier", () => {
    const req = extractOfferHeuristically(offer("comptable-sans-sections")).requirements;
    const m = matchAll(req, cv, NOW);
    expect(m.map((x) => x.coverage)).toEqual(["partial", "demonstrated", "missing", "demonstrated", "unknown"]);
    // Un Master de design n'équivaut pas à un BTS de comptabilité : niveau atteint, spécialité absente.
    expect(m[0]!.explanation).toMatch(/spécialité demandée \(Comptabilité, Gestion\) n'apparaît pas/);
    expect(m[2]!.explanation).toBe("Non trouvé dans votre CV vérifié : Excel, ERP comptable.");
    // L'expérience totale suffit en durée, mais l'explication précise que le domaine n'est pas vérifié.
    expect(m[1]!.explanation).toMatch(/domaine.*n'est pas vérifié/);
  });

  it("calcule la durée d'expérience sans compter deux fois les chevauchements", () => {
    const p = emptyProfile();
    const exp = (startDate: string, endDate: string | null, isCurrent = false) => ({
      title: "x", company: null, location: null, startDate, endDate, isCurrent, achievements: [], evidence: "x",
    });
    p.experiences = [exp("janv. 2020", "déc. 2021"), exp("06/2021", "06/2022"), exp("2024", null, true), exp("", null)];
    const r = totalExperienceYears(p, NOW);
    expect(r.years).toBeCloseTo(5.2, 1); // 2020-01→2022-06 (2,4 ans) + 2024-01→2026-11 (2,8 ans)
    expect(r.undated).toBe(1);
    expect(parseMonth("Févr. 2021")).toBe(2021 * 12 + 1);
  });

  it("reconnaît les niveaux de diplôme français", () => {
    expect(educationLevel("Bac+5")).toBe(5);
    expect(educationLevel("Master Design d'interaction")).toBe(5);
    expect(educationLevel("BTS Comptabilité et Gestion")).toBe(2);
    expect(educationLevel("Licence pro")).toBe(3);
    expect(educationLevel("Formation en ligne")).toBeNull();
  });

  it("extrait les termes significatifs d'un critère", () => {
    expect(requirementTerms("Maîtrise de Figma")).toEqual(["figma"]);
    expect(requirementTerms("Notions de HTML et CSS")).toEqual(["html", "css"]);
    expect(requirementTerms("Connaissances en accessibilité (RGAA, WCAG)")).toEqual(["accessibilite"]);
    expect(requirementTerms("Vous maîtrisez impérativement Excel (TCD) et un ERP comptable, idéalement SAP")).toEqual(["excel", "erp comptable"]);
  });

  it("affiche les termes tels que l'offre les écrit", async () => {
    const { originalWording } = await import("@/server/offers/matcher");
    expect(originalWording("Une certification en gestion de projet Agile serait appréciée", "certification gestion projet agile")).toBe("certification en gestion de projet Agile");
    expect(originalWording("Notions de HTML et CSS", "css")).toBe("CSS");
    expect(originalWording("Connaissance de l'anglais", "anglais")).toBe("l'anglais");
  });

  it("ne confond pas un terme avec une partie de mot", () => {
    const p = emptyProfile();
    p.experiences = [{ title: "Responsable succès client", company: null, location: null, startDate: null, endDate: null, isCurrent: false, achievements: ["Process de success planning"], evidence: "x" }];
    const [m] = matchAll([{ label: "Maîtrise de CSS", kind: "mandatory", category: "tool", offerEvidence: "x" }], p, NOW);
    expect(m!.coverage).toBe("missing");
  });
});

describe("suggestions", () => {
  it("propose d'ajouter aux compétences ce que le CV démontre déjà ailleurs", () => {
    const p = structuredClone(cv);
    p.skills = p.skills.filter((s) => s.name !== "Design system");
    const req = extractOfferHeuristically(offer("product-designer")).requirements;
    const suggestions = buildSuggestions(matchAll(req, p, NOW), p);
    const add = suggestions.find((s) => s.type === "add_skill_from_resume");
    expect(add).toMatchObject({ skillName: "Design system", resumeEvidence: "Création du design system utilisé par 4 équipes produit." });
    // Ne propose jamais d'ajouter d'office une compétence absente du CV
    const declare = suggestions.filter((s) => s.type === "declare_if_true");
    expect(declare.every((s) => s.skillName === null)).toBe(true);
  });

  it("applique uniquement les suggestions acceptées, et une déclaration exige une justification", () => {
    const base = emptyProfile();
    const s = (over: object) => ({ id: "x", requirementLabel: "r", title: "t", detail: "d", skillName: null, resumeEvidence: null, userNote: null, status: "accepted", type: "add_skill_from_resume", ...over }) as Parameters<typeof applySuggestions>[1][number];
    const { profile, applied } = applySuggestions(base, [
      s({ skillName: "Design system", resumeEvidence: "Création du design system" }),
      s({ skillName: "Jira", resumeEvidence: "Jira", status: "refused" }),
      s({ type: "declare_if_true", skillName: "SAP", userNote: null }),
      s({ type: "declare_if_true", skillName: "Agile", userNote: "Scrum pratiqué 2 ans chez Fintech Exemple" }),
    ]);
    expect(applied).toBe(2);
    expect(profile.skills.map((k) => k.name)).toEqual(["Design system", "Agile"]);
    expect(profile.skills[1]!.evidence).toMatch(/^Déclaré par vous/);
    expect(base.skills).toEqual([]); // le profil d'origine n'est pas modifié
  });
});

describe("analyzeOffer", () => {
  it("analyse sans IA et sans CV vérifié (critères seuls, pas de score)", async () => {
    const { analysis } = await analyzeOffer({ offerText: offer("product-designer"), overrides: { title: null, company: "Néobanque Exemple", location: null }, resume: null, provider: null, now: NOW });
    expect(analysis.score).toBeNull();
    expect(analysis.matchingSource).toBe("none");
    expect(analysis.metadata.company).toBe("Néobanque Exemple");
    expect(analysis.requirements.every((r) => r.coverage === "unknown")).toBe(true);
  });

  it("calcule un score explicable avec le CV", async () => {
    const { analysis, aiCalls } = await analyzeOffer({ offerText: offer("product-designer"), overrides: { title: null, company: null, location: null }, resume: { versionId: "v1", label: "Version 1", profile: cv }, provider: null, now: NOW });
    expect(analysis.score).toBe(92.1);
    expect(aiCalls).toEqual([]);
  });

  it("ignore les consignes injectées dans une offre", async () => {
    const { analysis } = await analyzeOffer({ offerText: offer("injection"), overrides: { title: null, company: null, location: null }, resume: { versionId: "v1", label: null, profile: cv }, provider: null, now: NOW });
    expect(analysis.ignoredLines).toHaveLength(1);
    expect(analysis.requirements.some((r) => /ignore/i.test(r.label))).toBe(false);
    expect(analysis.score).toBeLessThan(100);
  });

  it("rejette ce qu'une IA affirmerait sans preuve (simulation)", async () => {
    const text = offer("product-designer");
    const lying: LlmProvider = {
      id: "simulé",
      async generateStructured<T>(req: { feature: string }) {
        const data =
          req.feature === "offer_extract"
            ? {
                title: "Product Designer Senior", company: null, location: "Paris", department: null, contractType: "cdi", salaryText: null,
                requirements: [
                  { label: "Maîtrise de Figma", kind: "mandatory", category: "tool", offerEvidence: "Maîtrise de Figma" },
                  { label: "10 ans chez Google", kind: "mandatory", category: "experience", offerEvidence: "10 ans chez Google exigés" }, // inventé
                  { label: "Certification Agile", kind: "preferred", category: "certification", offerEvidence: "Une certification en gestion de projet Agile serait appréciée" },
                ],
              }
            : {
                matches: [
                  { index: 0, coverage: "demonstrated", resumeEvidence: "Figma", explanation: "Figma figure dans les compétences." },
                  { index: 1, coverage: "demonstrated", resumeEvidence: "Certifié PSM II", explanation: "Inventé." }, // preuve absente du CV
                ],
              };
        return { data: data as T, provider: "simulé", model: "simulé", usage: { inputTokens: 10, outputTokens: 10 } };
      },
    };
    const { analysis, aiCalls } = await analyzeOffer({ offerText: text, overrides: { title: null, company: null, location: null }, resume: { versionId: "v1", label: null, profile: cv }, provider: lying, now: NOW });
    expect(analysis.extractionSource).toBe("ai");
    expect(analysis.requirements.map((r) => r.label)).toEqual(["Maîtrise de Figma", "Certification Agile"]);
    expect(analysis.requirements[1]!.coverage).toBe("missing");
    expect(analysis.rejectedUngrounded).toBe(2);
    expect(aiCalls.map((c) => c.feature)).toEqual(["offer_extract", "offer_match"]);
    expect(resumeToText(cv)).toContain("Figma");
  });
});
