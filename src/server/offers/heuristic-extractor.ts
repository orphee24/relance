import type { OfferExtraction, OfferRequirement, RequirementCategory } from "@/lib/validation/offer";

/**
 * Extraction déterministe des critères d'une offre (sans IA).
 * Chaque critère conserve la ligne de l'offre dont il provient.
 */

type Section = "missions" | "profile" | "bonus" | "company" | "perks" | "other";

const HEADINGS: [Section, RegExp][] = [
  ["bonus", /^(les? plus|atouts?|un plus|serait un plus|bonus|nice[- ]to[- ]have|id[ée]alement|appr[ée]ci[ée]s?)\b/],
  ["profile", /^(votre profil|profil recherch[ée]|profil|comp[ée]tences( requises| attendues| recherch[ée]es)?|qualifications?|pr[ée]requis|ce que nous recherchons|qui [eê]tes[- ]vous|vous [eê]tes|requirements|who you are|exigences)\b/],
  ["missions", /^(vos missions|missions|le poste|description du poste|responsabilit[ée]s|ce que vous ferez|vos responsabilit[ée]s|your role|what you.ll do)\b/],
  ["company", /^(qui sommes[- ]nous|l'entreprise|[àa] propos|notre entreprise|about us|la soci[ée]t[ée])\b/],
  ["perks", /^(avantages|pourquoi nous rejoindre|ce que nous offrons|ce que nous proposons|nos avantages|r[ée]mun[ée]ration et avantages|benefits|perks)\b/],
];

const PREFERRED_RE = /\b(un plus|serait (un plus|appr[ée]ci[ée]e?)|appr[ée]ci[ée]e?s?|souhait[ée]e?s?|id[ée]alement|bonus|de pr[ée]f[ée]rence|si possible|est un atout|nice to have)\b/i;
const MANDATORY_RE = /\b(imp[ée]rati(f|vement)|obligatoire|exig[ée]e?|requis(e)?|indispensables?|n[ée]cessaires?|minimum|au moins|ma[iî]trise[zs]?|vous ma[iî]trisez|vous justifiez|titulaire|must)\b/i;
const REQUIREMENT_HINT = /\b(exp[ée]rience|ma[iî]tris\w*|connaissances?|comp[ée]tences?|dipl[oô]m\w*|titulaire|bac\s*\+|formation|anglais|allemand|espagnol|langues?|certifi\w*|vous [eê]tes|vous avez|vous justifiez|vous disposez|notions?|savoir|capacit[ée]|aisance|rigueur|autonomie|indispensables?)\b/i;
/** Le caractère facultatif porte sur tout le critère (et non sur une précision comme « idéalement dans la fintech »). */
const PREFERRED_WHOLE_RE = /^(id[ée]alement|de pr[ée]f[ée]rence|si possible|un plus|bonus)\b|\b(est un plus|serait (un plus|appr[ée]ci[ée]e?)|est appr[ée]ci[ée]e?|sont appr[ée]ci[ée]e?s|est un atout|nice to have)\s*[.!]?$/i;

const LANGUAGE_RE = /\b(anglais|allemand|espagnol|italien|portugais|n[ée]erlandais|arabe|chinois|mandarin|japonais|russe|english|german|spanish)\b/i;
const EDUCATION_RE = /\b(bac\s*\+\s*\d|bac\b|bts|dut|but|licence|bachelor|master|mast[eè]re|mba|dipl[oô]m|[ée]cole d'ing[ée]nieur|ing[ée]nieur dipl|doctorat|phd)\b/i;
const EXPERIENCE_RE = /\b(\d+)\s*(?:\+\s*)?(?:à\s*\d+\s*)?ans?\b.{0,30}\bexp[ée]rience|\bexp[ée]rience\b.{0,40}\b(\d+)\s*ans?\b/i;
const CERT_RE = /\b(certifi(cation|[ée]e?)|habilitation|caces|toeic|toefl|pmp|psm|scrum master|itil)\b/i;
const SOFT_RE = /\b(rigueur|rigoureux|organis[ée]e?|organisation|autonomie|autonome|curiosit[ée]|curieux|esprit d'[ée]quipe|relationnel|communication|sens du service|adaptabilit[ée]|cr[ée]ativit[ée]|leadership|proactivit[ée]|bienveillance|p[ée]dagogie)\b/i;
const TOOL_RE = /\b(excel|word|powerpoint|figma|sketch|adobe|photoshop|illustrator|indesign|sap|salesforce|hubspot|jira|confluence|notion|tableau|power ?bi|sql|python|java(script)?|typescript|react|angular|vue|node|php|git|docker|kubernetes|aws|azure|gcp|erp|crm|sage|cegid|autocad|solidworks|html|css|wordpress|google analytics)\b/i;

const CONTRACT_RE: [OfferExtraction["contractType"], RegExp][] = [
  ["cdi", /\bCDI\b/],
  ["cdd", /\bCDD\b/],
  ["alternance", /\b(alternance|apprentissage|contrat pro)\b/i],
  ["stage", /\bstage\b/i],
  ["interim", /\b(int[ée]rim|mission d'int[ée]rim)\b/i],
  ["freelance", /\b(freelance|ind[ée]pendant|portage)\b/i],
];
const SALARY_RE = /(\d{2,3}(?:[\s  .]?\d{3})?\s*(?:k€|k\s*€|K€|€|euros?)(?:\s*(?:-|à|–)\s*\d{2,3}(?:[\s  .]?\d{3})?\s*(?:k€|k\s*€|K€|€|euros?))?(?:\s*(?:brut|bruts)?\s*(?:annuels?|\/an|par an|mensuels?|\/mois))?)/i;

function headingOf(line: string): Section | null {
  if (line.length > 60) return null;
  const h = line.toLowerCase().replace(/[:#*•\-–—!?]/g, " ").replace(/\s+/g, " ").trim();
  for (const [section, re] of HEADINGS) if (re.test(h)) return section;
  return null;
}

export function classifyRequirement(text: string): RequirementCategory {
  if (EXPERIENCE_RE.test(text)) return "experience";
  if (EDUCATION_RE.test(text)) return "education";
  if (CERT_RE.test(text)) return "certification";
  if (LANGUAGE_RE.test(text) && !TOOL_RE.test(text)) return "language";
  if (TOOL_RE.test(text)) return "tool";
  if (SOFT_RE.test(text)) return "soft_skill";
  return "skill";
}

function cleanBullet(line: string): string {
  return line.replace(/^[\s•·*▪◦\-–—>✓✔]+/, "").replace(/[;.]+$/, "").trim();
}

/** Découpe une phrase longue en critères (« Vous êtes titulaire de… et justifiez de… »). */
function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[.;!])\s+(?=[A-ZÀ-Ý])|\s+et\s+(?=(?:vous\s+)?(?:justifiez|disposez|ma[iî]trisez|avez|poss[ée]dez)\b)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractOfferHeuristically(text: string): OfferExtraction {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const requirements: OfferRequirement[] = [];
  const seen = new Set<string>();
  let section: Section | null = null;
  let sawProfileSection = false;

  const push = (raw: string, sectionKind: "mandatory" | "preferred" | null) => {
    const cleaned = cleanBullet(raw);
    const label = cleaned.charAt(0).toLocaleUpperCase("fr-FR") + cleaned.slice(1);
    if (label.length < 4 || label.length > 300) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const preferred = PREFERRED_WHOLE_RE.test(label) || (PREFERRED_RE.test(label) && !MANDATORY_RE.test(label));
    const kind = sectionKind === "preferred" || preferred ? "preferred" : "mandatory";
    requirements.push({ label, kind, category: classifyRequirement(label), offerEvidence: raw.trim() });
  };

  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      section = h;
      if (h === "profile" || h === "bonus") sawProfileSection = true;
      continue;
    }
    if (section === "profile") push(line, null);
    else if (section === "bonus") push(line, "preferred");
  }

  // Offres sans intitulés de section : on repère les phrases qui expriment une exigence.
  if (!sawProfileSection) {
    for (const line of lines.slice(1)) {
      for (const sentence of splitSentences(line)) {
        if (REQUIREMENT_HINT.test(sentence) && !/\b(vous serez|vos missions|chargé\(e\) de|rémunération|salaire)\b/i.test(sentence)) {
          push(sentence, null);
        }
      }
    }
  }

  const head = lines.slice(0, 4).join(" \n ");
  const contractType = CONTRACT_RE.find(([, re]) => re.test(head))?.[0] ?? CONTRACT_RE.find(([, re]) => re.test(text))?.[0] ?? null;
  const salaryLine = lines.find((l) => /\b(salaire|r[ée]mun[ée]ration|package)\b/i.test(l) && SALARY_RE.test(l));
  const salaryText = (salaryLine ?? lines.slice(0, 4).find((l) => SALARY_RE.test(l)))?.match(SALARY_RE)?.[1]?.trim() ?? null;
  const locationLine = lines.find((l) => /^(lieu|localisation|location|ville)\s*:/i.test(l));

  return {
    title: lines[0] && lines[0].length <= 120 ? lines[0].replace(/\s*[-–—|]\s*(CDI|CDD|stage|alternance).*$/i, "").trim() : null,
    company: null,
    location: locationLine ? locationLine.split(":").slice(1).join(":").trim() || null : null,
    department: null,
    contractType,
    salaryText,
    requirements: requirements.slice(0, 40),
  };
}

/** Années d'expérience exigées par un critère, ou null. */
export function requiredYears(label: string): number | null {
  const m = label.match(EXPERIENCE_RE);
  const n = Number(m?.[1] ?? m?.[2]);
  return Number.isFinite(n) && n > 0 && n < 50 ? n : null;
}
