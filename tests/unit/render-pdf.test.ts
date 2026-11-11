import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "@/server/cv/extract-text";
import { parseResumeHeuristically } from "@/server/cv/heuristic-parser";
import { renderResumePdf } from "@/server/cv/render-pdf";
import { emptyProfile } from "@/lib/validation/resume-profile";

describe("renderResumePdf", () => {
  it("produit un PDF relisible contenant le profil vérifié", async () => {
    const src = new Uint8Array(readFileSync(new URL("../fixtures/cv-exemple.pdf", import.meta.url)));
    const profile = parseResumeHeuristically((await extractResumeText(src)).text);
    const pdf = await renderResumePdf(profile, { title: "CV — Camille Martin" });

    const back = await extractResumeText(pdf);
    for (const expected of ["Camille Martin", "Expérience professionnelle", "Fintech Exemple", "+18 %", "Accessibilité", "Anglais (courant)"]) {
      expect(back.text).toContain(expected);
    }
  });

  it("gère les caractères hors encodage et les longs contenus (pagination)", async () => {
    const p = emptyProfile();
    p.identity.fullName = "Zoé Ünal 李 😀";
    p.experiences = Array.from({ length: 12 }, (_, i) => ({
      title: `Poste ${i + 1}`,
      company: "Entreprise ≥ Exemple",
      location: null,
      startDate: "2020",
      endDate: "2021",
      isCurrent: false,
      achievements: Array.from({ length: 4 }, () => "Réalisation détaillée ".repeat(12)),
      evidence: "x",
    }));
    const pdf = await renderResumePdf(p, { title: "Test" });
    const text = (await extractResumeText(pdf)).text;
    expect(text).toContain("Zoé Ünal");
    expect(text).toContain("Entreprise >= Exemple");
    expect(text).toContain("Poste 12");
  });
});
