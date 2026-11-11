import type { ResumeProfile } from "@/lib/validation/resume-profile";
import type { CoverageState, OfferRequirement, RequirementResult } from "@/lib/validation/offer";
import { normalizeForMatch } from "@/server/cv/grounding";
import { requiredYears } from "./heuristic-extractor";

/**
 * Comparaison déterministe critère par critère entre une offre et un CV vérifié.
 * Ne déclare un critère démontré que si une ligne du CV le montre ; la ligne est conservée comme preuve.
 */

export type EvidenceOrigin = "skill" | "achievement" | "title" | "summary" | "education" | "language" | "dates";

export interface MatchDetail extends RequirementResult {
  /** D'où vient la preuve dans le CV (sert aux suggestions). */
  origin: EvidenceOrigin | null;
  /** Termes du critère retrouvés dans le CV, avec leur graphie dans le CV. */
  matchedTerms: { term: string; asWritten: string; origin: EvidenceOrigin; line: string }[];
  missingTerms: string[];
}

interface CvLine {
  text: string;
  norm: string;
  origin: EvidenceOrigin;
}

/** Texte du CV vérifié, une information par ligne : c'est la référence de l'ancrage. */
export function resumeToText(p: ResumeProfile): string {
  return resumeLines(p).map((l) => l.text).join("\n");
}

function resumeLines(p: ResumeProfile): CvLine[] {
  const lines: Omit<CvLine, "norm">[] = [];
  if (p.identity.headline) lines.push({ text: p.identity.headline, origin: "title" });
  if (p.summary) lines.push({ text: p.summary, origin: "summary" });
  for (const x of p.experiences) {
    lines.push({ text: [x.title, x.company].filter(Boolean).join(" — "), origin: "title" });
    for (const a of x.achievements) lines.push({ text: a, origin: "achievement" });
  }
  for (const s of p.skills) lines.push({ text: s.name, origin: "skill" });
  for (const e of p.education) lines.push({ text: [e.degree, e.institution, e.year].filter(Boolean).join(" — "), origin: "education" });
  for (const l of p.languages) lines.push({ text: l.level ? `${l.name} (${l.level})` : l.name, origin: "language" });
  return lines.map((l) => ({ ...l, norm: normalizeForMatch(l.text) }));
}

const GENERIC = new Set(
  (
    "a au aux avec ce ces cette d de des du en et est etre un une le la les l ou par pour sur dans vos votre vous nous " +
    "maitrise maitriser maitrisez maitrisant connaissance connaissances notion notions bonne bonnes solide solides " +
    "experience experiences confirme confirmee confirmes significative premiere avere averee reussie " +
    "competence competences capacite capacites aptitude savoir faire utilisation pratique impérativement imperativement " +
    "minimum moins requis requise souhaite souhaitee apprecie appreciee indispensable indispensables obligatoire " +
    "serait plus atout ideal idealement si possible preference equivalent similaire poste outil outils logiciel logiciels " +
    "titulaire justifiez avez etes disposez possedez maitrisez environnement idealement"
  ).split(" "),
);

/** Termes significatifs d'un critère : chaque élément d'une énumération, sans les mots génériques. */
export function requirementTerms(label: string): string[] {
  const main = label.replace(/\([^)]*\)/g, " "); // parenthèses = précisions ou exemples
  const withoutOptional = main.replace(/\b(id[ée]alement|de pr[ée]f[ée]rence|si possible)\b[^,;.]*/gi, " ");
  const chunks = withoutOptional.split(/,|;|\/|\bet\b|\bou\b|\bainsi que\b|\+(?!\s*\d)/i);
  const terms = chunks
    .map((c) =>
      normalizeForMatch(c)
        .replace(/[^a-z0-9+# -]/g, " ")
        .split(/\s+/)
        .filter((w) => w && !GENERIC.has(w) && !/^\d+$/.test(w))
        .join(" ")
        .trim(),
    )
    .filter((t) => t.length >= 2);
  if (terms.length === 0) {
    // Repli : contenu des parenthèses (ex. « Bonne connaissance (SQL) »)
    const inner = [...label.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? "").join(",");
    return inner ? requirementTerms(inner) : [];
  }
  return Array.from(new Set(terms));
}

/**
 * Retrouve dans le libellé d'origine la formulation d'un terme normalisé
 * (« gestion projet agile » → « gestion de projet Agile »), pour l'afficher tel que l'offre l'écrit.
 */
export function originalWording(label: string, term: string): string {
  const words = label.split(/\s+/);
  const clean = (w: string) => normalizeForMatch(w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "")).replace(/^[a-z]'/, "");
  const parts = term.split(" ");
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  for (let i = 0; i < words.length; i++) {
    if (clean(words[i]!) !== first) continue;
    for (let j = i; j < words.length && j < i + 8; j++) {
      if (clean(words[j]!) === last) {
        return words
          .slice(i, j + 1)
          .join(" ")
          .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
      }
    }
  }
  return term;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(needle)}($|[^a-z0-9])`).test(haystack);
}

/** Retrouve la graphie d'origine d'un terme normalisé dans une ligne. */
function asWrittenIn(line: string, termNorm: string): string {
  const words = line.split(/\s+/);
  const n = termNorm.split(" ").length;
  for (let i = 0; i + n <= words.length; i++) {
    const slice = words.slice(i, i + n).join(" ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
    if (normalizeForMatch(slice) === termNorm) return slice;
  }
  return termNorm;
}

const ORIGIN_PRIORITY: EvidenceOrigin[] = ["skill", "achievement", "title", "summary", "education", "language"];

function findTerm(term: string, lines: CvLine[]) {
  for (const origin of ORIGIN_PRIORITY) {
    for (const line of lines.filter((l) => l.origin === origin)) {
      if (containsWord(line.norm, term)) return { full: true, line };
    }
  }
  // Le CV contient une partie seulement du terme (ex. « recherche utilisateur » pour « recherche utilisateur quantitative »)
  for (const origin of ORIGIN_PRIORITY) {
    for (const line of lines.filter((l) => l.origin === origin && l.origin === "skill")) {
      if (line.norm.length >= 3 && containsWord(term, line.norm)) return { full: false, line };
    }
  }
  return null;
}

// --- Expérience ---------------------------------------------------------------

const MONTHS: Record<string, number> = {
  janv: 0, jan: 0, fevr: 1, fev: 1, feb: 1, mars: 2, mar: 2, avr: 3, apr: 3, mai: 4, may: 4, juin: 5, jun: 5,
  juil: 6, jul: 6, aout: 7, aug: 7, sept: 8, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseMonth(value: string | null): number | null {
  if (!value) return null;
  const v = normalizeForMatch(value);
  const year = v.match(/(19|20)\d{2}/)?.[0];
  if (!year) return null;
  const numeric = v.match(/\b(\d{1,2})[/.-](?:19|20)\d{2}/);
  let month = numeric ? Number(numeric[1]) - 1 : 0;
  if (!numeric) {
    const word = Object.keys(MONTHS).find((m) => v.startsWith(m) || v.includes(` ${m}`));
    if (word) month = MONTHS[word]!;
  }
  return Number(year) * 12 + Math.min(11, Math.max(0, month));
}

/** Années d'expérience cumulées, sans compter deux fois les périodes qui se chevauchent. */
export function totalExperienceYears(p: ResumeProfile, now = new Date()): { years: number; dated: number; undated: number } {
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const ranges: [number, number][] = [];
  let undated = 0;
  for (const x of p.experiences) {
    const start = parseMonth(x.startDate);
    const end = x.isCurrent ? nowM : parseMonth(x.endDate) ?? (x.endDate ? null : null);
    if (start === null || end === null || end < start) {
      undated++;
      continue;
    }
    ranges.push([start, Math.min(end, nowM)]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let cur: [number, number] | null = null;
  for (const r of ranges) {
    if (!cur || r[0] > cur[1]) {
      if (cur) months += cur[1] - cur[0];
      cur = [...r];
    } else cur[1] = Math.max(cur[1], r[1]);
  }
  if (cur) months += cur[1] - cur[0];
  return { years: Math.floor((months / 12) * 10) / 10, dated: ranges.length, undated };
}

// --- Formation -----------------------------------------------------------------

const DEGREE_WORDS = new Set(
  "bts dut but licence bachelor master mastere mba ecole diplome doctorat phd niveau superieur etudes formation art applique equivalent titre".split(" "),
);

export function educationLevel(text: string): number | null {
  const v = normalizeForMatch(text);
  const bac = v.match(/bac\s*\+\s*(\d)/);
  if (bac) return Number(bac[1]);
  if (/\b(doctorat|phd|these)\b/.test(v)) return 8;
  if (/\b(master|mastere|mba|ingenieur|dea|dess|msc)\b/.test(v)) return 5;
  if (/\b(licence|bachelor|but|maitrise)\b/.test(v)) return 3;
  if (/\b(bts|dut|deug)\b/.test(v)) return 2;
  if (/\bbac\b|baccalaureat/.test(v)) return 0;
  return null;
}

// --- Langues -------------------------------------------------------------------

const LANG_ALIASES: Record<string, string[]> = {
  anglais: ["anglais", "english"],
  allemand: ["allemand", "german", "deutsch"],
  espagnol: ["espagnol", "spanish", "espanol"],
  italien: ["italien", "italian"],
  portugais: ["portugais", "portuguese"],
  neerlandais: ["neerlandais", "dutch"],
  arabe: ["arabe", "arabic"],
  chinois: ["chinois", "mandarin", "chinese"],
  japonais: ["japonais", "japanese"],
  russe: ["russe", "russian"],
};
const HIGH_LEVEL = /\b(courant|bilingue|natif|native|maternelle|fluent|c1|c2|professionnel|avance)\b/;
const ASKS_HIGH = /\b(courant|bilingue|fluent|c1|c2|professionnel|avance|excellent)\b/;

// --- Évaluation ----------------------------------------------------------------

function result(req: OfferRequirement, coverage: CoverageState, explanation: string, extra: Partial<MatchDetail> = {}): MatchDetail {
  return {
    ...req,
    coverage,
    resumeEvidence: null,
    explanation,
    origin: null,
    matchedTerms: [],
    missingTerms: [],
    ...extra,
  };
}

export function matchRequirement(req: OfferRequirement, profile: ResumeProfile, now = new Date()): MatchDetail {
  const lines = resumeLines(profile);
  const labelNorm = normalizeForMatch(req.label);

  if (req.category === "experience") {
    const years = requiredYears(req.label);
    const exp = totalExperienceYears(profile, now);
    if (years === null) return matchTerms(req, lines);
    if (exp.dated === 0) {
      return result(req, "unknown", "Aucune expérience datée dans votre CV : la durée ne peut pas être calculée.");
    }
    const evidence = profile.experiences
      .filter((x) => x.startDate)
      .map((x) => `${[x.title, x.company].filter(Boolean).join(" — ")} (${x.startDate} – ${x.isCurrent ? "aujourd'hui" : x.endDate ?? "?"})`)
      .join("\n");
    const fmt = exp.years.toLocaleString("fr-FR");
    const note = exp.undated ? ` ${exp.undated} expérience(s) sans dates n'ont pas pu être comptées.` : "";
    if (exp.years >= years) {
      return result(req, "demonstrated", `Environ ${fmt} ans d'expérience professionnelle datée pour ${years} demandés. Le domaine précisé dans l'offre n'est pas vérifié automatiquement.${note}`, { resumeEvidence: evidence, origin: "dates" });
    }
    if (exp.years >= years * 0.7) {
      return result(req, "partial", `Environ ${fmt} ans d'expérience datée pour ${years} demandés.${note}`, { resumeEvidence: evidence, origin: "dates" });
    }
    return result(req, "missing", `Environ ${fmt} ans d'expérience datée pour ${years} demandés.${note}`, { origin: "dates" });
  }

  if (req.category === "education") {
    const required = educationLevel(req.label);
    const levels = profile.education
      .map((e) => ({ e, level: educationLevel(`${e.degree} ${e.institution ?? ""}`) }))
      .filter((x): x is { e: (typeof profile.education)[number]; level: number } => x.level !== null)
      .sort((a, b) => b.level - a.level);
    if (required === null) return matchTerms(req, lines);
    if (profile.education.length === 0) return result(req, "unknown", "Aucune formation dans votre CV vérifié.");
    const best = levels[0];
    if (!best) return result(req, "unknown", "Le niveau de vos diplômes n'a pas pu être déterminé. Vérifiez-le vous-même.");
    const evidence = [best.e.degree, best.e.institution, best.e.year].filter(Boolean).join(" — ");
    if (best.level >= required) {
      // Le niveau ne suffit pas : la spécialité demandée doit aussi apparaître dans une formation.
      const fieldWords = requirementTerms(req.label)
        .flatMap((t) => t.split(" "))
        .filter((w) => !DEGREE_WORDS.has(w) && !/^bac\+?\d*$/.test(w) && w.length >= 3);
      const educationText = normalizeForMatch(profile.education.map((e) => `${e.degree} ${e.institution ?? ""}`).join(" "));
      const fieldFound = fieldWords.length === 0 || fieldWords.some((w) => containsWord(educationText, w));
      if (!fieldFound) {
        return result(req, "partial", `Niveau suffisant (Bac+${best.level} pour Bac+${required}), mais la spécialité demandée (${fieldWords.map((w) => originalWording(req.label, w)).join(", ")}) n'apparaît pas dans vos formations.`, {
          resumeEvidence: evidence,
          origin: "education",
        });
      }
      return result(req, "demonstrated", `Niveau de diplôme suffisant (Bac+${best.level} pour Bac+${required} demandé)${fieldWords.length ? ", spécialité cohérente" : ""}.`, { resumeEvidence: evidence, origin: "education" });
    }
    const equivalent = /equivalen/.test(labelNorm);
    return result(req, equivalent ? "partial" : "missing", `Bac+${best.level} dans votre CV pour Bac+${required} demandé${equivalent ? " (l'offre accepte un équivalent)" : ""}.`, {
      resumeEvidence: equivalent ? evidence : null,
      origin: "education",
    });
  }

  if (req.category === "language") {
    const lang = Object.entries(LANG_ALIASES).find(([, aliases]) => aliases.some((a) => containsWord(labelNorm, a)));
    if (!lang) return matchTerms(req, lines);
    const entry = profile.languages.find((l) => lang[1].some((a) => containsWord(normalizeForMatch(l.name), a)));
    if (!entry) return result(req, "missing", `Le ${lang[0]} n'apparaît pas dans votre CV.`);
    const evidence = entry.level ? `${entry.name} (${entry.level})` : entry.name;
    const levelNorm = normalizeForMatch(entry.level ?? "");
    if (!ASKS_HIGH.test(labelNorm) || HIGH_LEVEL.test(levelNorm)) {
      return result(req, "demonstrated", `${entry.name}${entry.level ? ` (${entry.level})` : ""} figure dans votre CV.`, { resumeEvidence: evidence, origin: "language" });
    }
    return result(req, "partial", `${entry.name} figure dans votre CV, mais ${entry.level ? `le niveau « ${entry.level} »` : "aucun niveau"} ne confirme pas le niveau demandé.`, {
      resumeEvidence: evidence,
      origin: "language",
    });
  }

  return matchTerms(req, lines);
}

function matchTerms(req: OfferRequirement, lines: CvLine[]): MatchDetail {
  const terms = requirementTerms(req.label);
  if (terms.length === 0) return result(req, "unknown", "Critère trop général pour être vérifié automatiquement.");

  const matched: MatchDetail["matchedTerms"] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const term of terms) {
    const hit = findTerm(term, lines);
    if (hit?.full) matched.push({ term, asWritten: asWrittenIn(hit.line.text, term), origin: hit.line.origin, line: hit.line.text });
    else if (hit) {
      partial.push(term);
      matched.push({ term, asWritten: hit.line.text, origin: hit.line.origin, line: hit.line.text });
    }
    else missing.push(term);
  }

  const evidence = Array.from(new Set(matched.map((m) => m.line))).join("\n") || null;
  const origin = matched[0]?.origin ?? null;
  const fullCount = matched.length - partial.length;

  if (fullCount === terms.length) {
    return result(req, "demonstrated", `Retrouvé dans votre CV : ${matched.map((m) => m.asWritten).join(", ")}.`, { resumeEvidence: evidence, origin, matchedTerms: matched });
  }
  if (matched.length > 0) {
    const parts = [
      fullCount ? `retrouvé : ${matched.filter((m) => !partial.includes(m.term)).map((m) => m.asWritten).join(", ")}` : null,
      partial.length
        ? partial
            .map((t) => `votre CV mentionne « ${matched.find((m) => m.term === t)?.line} », sans couvrir tout « ${originalWording(req.label, t)} »`)
            .join(" ; ")
        : null,
      missing.length ? `non trouvé : ${missing.map((t) => originalWording(req.label, t)).join(", ")}` : null,
    ].filter(Boolean);
    return result(req, "partial", `${parts.join(" ; ")}.`.replace(/^./, (c) => c.toUpperCase()), {
      resumeEvidence: evidence,
      origin,
      matchedTerms: matched,
      missingTerms: missing,
    });
  }
  if (req.category === "soft_skill") {
    return result(req, "unknown", "Qualité personnelle : elle se démontre par des exemples concrets plutôt que par un mot-clé.", { missingTerms: missing });
  }
  return result(req, "missing", `Non trouvé dans votre CV vérifié : ${missing.map((t) => originalWording(req.label, t)).join(", ")}.`, {
    missingTerms: missing,
  });
}

export function matchAll(requirements: OfferRequirement[], profile: ResumeProfile, now = new Date()): MatchDetail[] {
  return requirements.map((r) => matchRequirement(r, profile, now));
}
