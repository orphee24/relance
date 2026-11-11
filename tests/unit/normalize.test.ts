import { describe, expect, it } from "vitest";
import { applicationDedupeKey, normalizeCompanyName, normalizeDomain, normalizeText } from "@/lib/normalize";

describe("normalizeCompanyName", () => {
  it("retire accents, ponctuation et formes juridiques", () => {
    expect(normalizeCompanyName("Société Générale SA")).toBe("societe generale");
    expect(normalizeCompanyName("L'Oréal Groupe")).toBe("l oreal");
    expect(normalizeCompanyName("ACME, S.A.S.")).toBe("acme s a s"); // ponctuée : volontairement conservée
    expect(normalizeCompanyName("Decathlon SASU")).toBe("decathlon");
  });
  it("ne retire pas les sous-chaînes au milieu des mots", () => {
    expect(normalizeCompanyName("Sanofi")).toBe("sanofi");
    expect(normalizeCompanyName("Salesforce")).toBe("salesforce");
  });
  it("retourne null pour une entrée vide", () => {
    expect(normalizeCompanyName("  SA ")).toBeNull();
    expect(normalizeCompanyName(null)).toBeNull();
  });
});

describe("normalizeText", () => {
  it("conserve les symboles utiles aux compétences", () => {
    expect(normalizeText("C++ / C#")).toBe("c++ c#");
    expect(normalizeText("SAS (logiciel)")).toBe("sas logiciel");
  });
});

describe("applicationDedupeKey", () => {
  it("correspond à la clé générée en base", () => {
    expect(applicationDedupeKey("Société Générale SA", "Développeuse Full-Stack")).toBe(
      "societe generale|developpeuse full stack",
    );
  });
});

describe("normalizeDomain", () => {
  it("extrait le domaine officiel", () => {
    expect(normalizeDomain("https://www.Orange.com/fr/carrieres")).toBe("orange.com");
    expect(normalizeDomain("orange.fr")).toBe("orange.fr");
  });
  it("rejette les entrées invalides", () => {
    expect(normalizeDomain("pas un domaine")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });
});
