import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cityOf, classifyRole, domainTokens, recommendStrategy, relevanceInputs, sameCompany, tokenOverlap, type ContactFacts } from "@/server/network/engine";
import { computeRelevance } from "@/server/network/relevance";
import { buildSearchLinks, extractPeopleFromText, jobCore, looksLikePersonName, parseContactsCsv, parseCsv } from "@/server/network/sources";

const app = { job_title: "Product Designer Senior (H/F)", location: "Paris 9e", department: null, status: "to_prepare" as const };
const contact = (over: Partial<ContactFacts>): ContactFacts => ({
  current_title: null, department: null, work_location: null, role_type: "other", has_mutual_connection: false, mutual_connection_note: null, ...over,
});

describe("classification des fonctions", () => {
  it.each([
    ["Talent Acquisition Partner", "recruiter"],
    ["Chargée de recrutement", "recruiter"],
    ["HR Business Partner", "hr"],
    ["Responsable RH", "hr"],
    ["Lead Product Designer", "manager"],
    ["Head of Design", "manager"],
    ["Directrice financière", "manager"],
    ["Product Designer", "peer"],
    ["UX/UI Designer", "peer"],
    ["Comptable", "other"],
  ])("%s → %s", (title, role) => {
    expect(classifyRole(title, "Product Designer Senior (H/F)")).toBe(role);
  });

  it("extrait les mots métier", () => {
    expect(domainTokens("Lead Product Designer Senior (H/F)")).toEqual(["product", "designer"]);
    expect(tokenOverlap(domainTokens("UX Designer"), domainTokens("Product Designer"))).toBe(0.5);
    expect(tokenOverlap(domainTokens("Design system designer"), domainTokens("Designer"))).toBe(1);
  });

  it("compare les villes sans les arrondissements", () => {
    expect(cityOf("Paris 9e")).toBe("paris");
    expect(cityOf("Lyon (69)")).toBe("lyon");
    expect(cityOf("Télétravail")).toBeNull();
  });

  it("ne rapproche pas des entreprises aux noms différents", () => {
    expect(sameCompany("Néobanque Exemple SAS", "neobanque exemple")).toBe(true);
    expect(sameCompany("Orange", "Orange Bank")).toBe(false);
    expect(sameCompany(null, "x")).toBe(false);
  });
});

describe("pertinence", () => {
  it("score un manager du métier, même ville, avec connexion commune", () => {
    const c = contact({ current_title: "Lead Product Designer", work_location: "Paris", role_type: "manager", has_mutual_connection: true, mutual_connection_note: "Ancienne collègue de Camille chez Agence Exemple" });
    const r = computeRelevance(relevanceInputs(c, app));
    // 30 (métier) + 0 (service inconnu) + 15 (0,75 × 20) + 15 + 10
    expect(r.score).toBe(70);
    expect(r.criteria.find((x) => x.key === "departmentProximity")?.known).toBe(false);
    expect(r.criteria.find((x) => x.key === "mutualConnection")?.reason).toMatch(/Ancienne collègue/);
  });

  it("n'estime jamais une information absente", () => {
    const r = computeRelevance(relevanceInputs(contact({}), app));
    expect(r.score).toBe(0);
    expect(r.unknownCount).toBe(5);
  });

  it("un recruteur compte comme interlocuteur du recrutement, pas comme même métier", () => {
    const c = contact({ current_title: "Talent Acquisition Partner", role_type: "recruiter", work_location: "Lyon" });
    const r = computeRelevance(relevanceInputs(c, app));
    expect(r.criteria.map((x) => [x.key, x.value])).toEqual([
      ["roleProximity", 0], ["departmentProximity", null], ["hiringRole", 1], ["mutualConnection", null], ["geography", 0],
    ]);
  });
});

describe("stratégie recommandée", () => {
  const base = { has_mutual_connection: false, roleProximity: null, departmentProximity: null, do_not_contact: false };
  const rec = { ...base, id: "r", role_type: "recruiter" as const, score: 30 };
  const peer = { ...base, id: "p", role_type: "peer" as const, score: 60, has_mutual_connection: true };
  const mgr = { ...base, id: "m", role_type: "manager" as const, score: 80, roleProximity: 1 };

  it("recruteur tant que la candidature n'est pas envoyée", () => {
    expect(recommendStrategy([rec, peer, mgr], "to_prepare")?.strategy).toBe("recruiter");
  });
  it("collègue avec connexion commune ensuite", () => {
    expect(recommendStrategy([rec, peer, mgr], "sent")).toMatchObject({ contactId: "p", strategy: "peer" });
  });
  it("manager proche du poste", () => {
    expect(recommendStrategy([rec, mgr], "sent")).toMatchObject({ contactId: "m", strategy: "manager" });
  });
  it("ignore les personnes à ne plus contacter", () => {
    expect(recommendStrategy([{ ...mgr, do_not_contact: true }], "sent")).toBeNull();
  });
});

describe("recherche assistée", () => {
  it("génère des liens que l'utilisateur ouvre lui-même", () => {
    const links = buildSearchLinks({ company: "Néobanque Exemple", jobTitle: "Product Designer Senior (H/F)", domain: "https://www.neobanque-exemple.fr/carrieres" });
    expect(jobCore("Product Designer Senior (H/F)")).toBe("Product Designer");
    expect(links.map((l) => l.key)).toEqual(["peers-li", "peers-g", "managers-g", "recruiters-li", "recruiters-g", "team-page"]);
    for (const l of links) expect(l.url).toMatch(/^https:\/\/www\.(linkedin|google)\.com\//);
    expect(decodeURIComponent(links[1]!.url)).toContain('site:linkedin.com/in "Néobanque Exemple" "Product Designer"');
    expect(decodeURIComponent(links[5]!.url)).toContain("site:neobanque-exemple.fr");
  });
});

describe("extraction d'une page équipe", () => {
  it("lit les formats courants et ignore les intitulés de section", () => {
    const text = `Notre équipe
Claire Durand
Lead Product Designer
Karim Benali — Talent Acquisition Partner
MARTIN Sophie, Directrice financière
Rejoignez-nous
Jean-Pierre de La Fontaine
En savoir plus
Contact : 01 23 45 67 89`;
    const people = extractPeopleFromText(text);
    expect(people.map((p) => [p.firstName, p.lastName, p.title])).toEqual([
      ["Claire", "Durand", "Lead Product Designer"],
      ["Karim", "Benali", "Talent Acquisition Partner"],
      ["Sophie", "MARTIN", "Directrice financière"],
      ["Jean-Pierre", "de La Fontaine", null],
    ]);
  });
  it("refuse ce qui ne ressemble pas à un nom", () => {
    expect(looksLikePersonName("NOTRE ÉQUIPE")).toBe(false);
    expect(looksLikePersonName("Product Designer Senior Lead Paris")).toBe(false);
    expect(looksLikePersonName("Appelez le 0123")).toBe(false);
  });
});

describe("import CSV de contacts", () => {
  it("lit l'export de relations, ignore les emails et les liens non sécurisés", () => {
    const r = parseContactsCsv(readFileSync(new URL("../fixtures/reseau/connections.csv", import.meta.url), "utf8"));
    expect(r.error).toBeUndefined();
    expect(r.ignoredEmailColumn).toBe(true);
    expect(r.rows).toHaveLength(4);
    expect(r.skipped).toBe(0); // la ligne vide n'est pas un contact
    expect(r.rows[0]).toEqual({ first_name: "Claire", last_name: "Durand", profile_url: "https://www.linkedin.com/in/claire-durand-exemple", company_name: "Néobanque Exemple SAS", current_title: "Lead Product Designer" });
    expect(r.rows[2]).toMatchObject({ last_name: "D'Almeida, PhD", current_title: "UX Researcher\n(temps partiel)" });
    expect(r.rows[3]!.profile_url).toBeNull();
    expect(JSON.stringify(r.rows)).not.toContain("@");
  });
  it("accepte un export français séparé par des points-virgules", () => {
    const r = parseContactsCsv("﻿Prénom;Nom;Entreprise;Poste\nAnne;Roux;Acme;Comptable\n");
    expect(r.rows).toEqual([{ first_name: "Anne", last_name: "Roux", profile_url: null, company_name: "Acme", current_title: "Comptable" }]);
  });
  it("signale un fichier sans les colonnes attendues", () => {
    expect(parseContactsCsv("a,b\n1,2").error).toMatch(/introuvables/);
    expect(parseCsv('a,"b ""c"""\n')).toEqual([["a", 'b "c"']]);
  });
});

describe("service", () => {
  it("ignore les mots d'organisation (équipe, service…)", () => {
    const c = { current_title: "Product Designer", department: "Onboarding", work_location: null, role_type: "peer" as const, has_mutual_connection: false, mutual_connection_note: null };
    const r = relevanceInputs(c, { job_title: "Product Designer", location: null, department: "Équipe Onboarding", status: "sent" });
    expect(r.departmentProximity.value).toBe(1);
  });
});
