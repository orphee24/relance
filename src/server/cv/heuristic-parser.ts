import {
  emptyProfile,
  type Education,
  type Experience,
  type Language,
  type ResumeProfile,
  type Skill,
} from "@/lib/validation/resume-profile";

/**
 * Analyseur déterministe de CV (sans IA).
 * Il ne produit que ce qu'il lit : chaque élément conserve sa ligne source comme preuve.
 * Il sert de solution de repli et de base de comparaison pour l'extraction IA.
 */

type SectionKey = "summary" | "experience" | "education" | "skills" | "languages" | "other";

const SECTION_HEADINGS: [SectionKey, RegExp][] = [
  ["experience", /^(exp[ée]riences?( professionnelles?)?|parcours( professionnel)?|emplois?|work experience|experience|professional experience|employment)$/],
  ["education", /^(formations?|[ée]ducation|dipl[oô]mes?( et formations?)?|cursus|scolarit[ée]|education|academic background)$/],
  ["skills", /^(comp[ée]tences?( techniques| cl[ée]s)?|savoir-faire|outils|skills|technical skills|hard skills|expertises?)$/],
  ["languages", /^(langues?|languages?)$/],
  ["summary", /^(profil|r[ée]sum[ée]|[àa] propos|about( me)?|summary|profile|objectif)$/],
  ["other", /^(centres? d'int[ée]r[eê]ts?|loisirs|int[ée]r[eê]ts|hobbies|interests|r[ée]f[ée]rences|projets?|projects|certifications?|b[ée]n[ée]volat)$/],
];

const MONTHS =
  "janv(?:ier)?|f[ée]vr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|october|november|dec(?:ember)?";
const DATE_TOKEN = `(?:(?:${MONTHS})\\.?\\s+)?(?:\\d{1,2}[/.-])?(?:19|20)\\d{2}`;
const CURRENT_TOKEN = "aujourd'hui|aujourd’hui|pr[ée]sent|actuel(?:lement)?|en cours|now|present|current";
const DATE_RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|à|au|to|›|>)\\s*(${DATE_TOKEN}|${CURRENT_TOKEN})`, "i");
const SINCE_RE = new RegExp(`(?:depuis|since)\\s+(${DATE_TOKEN})`, "i");
const YEAR_RE = /\b(19[5-9]\d|20\d{2})\b/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/;
const URL_RE = /https?:\/\/\S+|(?:www\.|linkedin\.com\/)\S+/i;
const QUANTIFIED_RE = /\d+(?:[.,]\d+)?\s*(?:%|k€|m€|€|k|m|x|clients?|personnes?|utilisateurs?|projets?|équipes?|ans?|mois)/i;
const LANGUAGE_NAMES =
  /\b(fran[cç]ais|anglais|espagnol|allemand|italien|portugais|arabe|chinois|mandarin|japonais|russe|n[ée]erlandais|polonais|turc|cor[ée]en|hindi|english|french|spanish|german|italian)\b/i;

function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:•\-–—|#*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSection(line: string): SectionKey | null {
  if (line.length > 50) return null;
  const h = normalizeHeading(line);
  for (const [key, re] of SECTION_HEADINGS) if (re.test(h)) return key;
  return null;
}

function splitList(text: string): string[] {
  return text
    .split(/[,;•·|\n]|\s[-–]\s|\s\/\s/)
    .map((s) => s.replace(/^[\s*•·-]+|[\s.]+$/g, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 60 && !/^\d+$/.test(s));
}

function looksLikeName(line: string): boolean {
  if (/\d|@/.test(line) || line.length > 60) return false;
  const words = line.split(/\s+/);
  return words.length >= 2 && words.length <= 5 && words.every((w) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(w) || /^[\p{Lu}'’.-]+$/u.test(w));
}

/** « Poste — Entreprise, Ville » / « Poste chez Entreprise » / « Poste | Entreprise » */
function splitTitleLine(line: string): Pick<Experience, "title" | "company" | "location"> {
  const m = line.split(/\s+(?:—|–|-|\||chez|@|at)\s+/i);
  const title = (m[0] ?? line).trim();
  let company: string | null = null;
  let location: string | null = null;
  if (m[1]) {
    const [c, ...rest] = m.slice(1).join(" - ").split(/,\s*/);
    company = c?.trim() || null;
    location = rest.join(", ").trim() || null;
  }
  return { title, company, location };
}

function parseDates(line: string): Pick<Experience, "startDate" | "endDate" | "isCurrent"> | null {
  const range = line.match(DATE_RANGE_RE);
  if (range) {
    const end = range[2] ?? null;
    const isCurrent = end ? new RegExp(`^(${CURRENT_TOKEN})$`, "i").test(end.trim()) : false;
    return { startDate: range[1]?.trim() ?? null, endDate: isCurrent ? null : end?.trim() ?? null, isCurrent };
  }
  const since = line.match(SINCE_RE);
  if (since) return { startDate: since[1]?.trim() ?? null, endDate: null, isCurrent: true };
  return null;
}

function parseExperiences(lines: string[]): Experience[] {
  const out: Experience[] = [];
  let current: Experience | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const dates = parseDates(line);
    if (dates) {
      // La ligne de dates suit (ou contient) l'intitulé du poste.
      const inline = line.replace(DATE_RANGE_RE, "").replace(SINCE_RE, "").replace(/[,|()\s—–-]+$/, "").trim();
      let titleLine = inline.length > 3 ? inline : null;
      if (!titleLine && current && current.achievements.length > 0) {
        // l'intitulé a été pris pour une réalisation de l'expérience précédente
        titleLine = current.achievements.pop() ?? null;
      } else if (!titleLine && !current) {
        titleLine = lines[i - 1] ?? null;
      } else if (!titleLine && current && current.achievements.length === 0 && current.startDate === null) {
        // l'expérience en cours n'a pas encore de dates : ce sont les siennes
        Object.assign(current, dates);
        current.evidence = `${current.evidence}\n${line}`;
        continue;
      }
      if (current) out.push(current);
      const parts = splitTitleLine(titleLine ?? line);
      current = { ...parts, ...dates, achievements: [], evidence: titleLine ? `${titleLine}\n${line}` : line };
      continue;
    }
    if (!current) {
      current = { ...splitTitleLine(line), startDate: null, endDate: null, isCurrent: false, achievements: [], evidence: line };
      continue;
    }
    const cleaned = line.replace(/^[\s•·*▪◦-]+/, "").trim();
    if (cleaned.length >= 3) current.achievements.push(cleaned);
  }
  if (current) out.push(current);
  return out.filter((x) => x.title.length >= 2);
}

function parseEducation(lines: string[]): Education[] {
  return lines
    .filter((l) => l.length >= 4)
    .map((line) => {
      const year = line.match(YEAR_RE)?.[0] ?? null;
      const withoutYear = line.replace(/[,(]?\s*(?:19|20)\d{2}\s*[)]?\s*(?:[-–]\s*(?:19|20)\d{2})?/g, "").replace(/[,\s—–-]+$/, "").trim();
      const [degree, institution] = withoutYear.split(/\s+(?:—|–|-|\||,)\s+|,\s+/);
      return { degree: (degree ?? line).trim(), institution: institution?.trim() || null, year, evidence: line };
    })
    .filter((e) => e.degree.length >= 2);
}

function parseSkills(lines: string[]): Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const line of lines) {
    // « Outils : Figma, Jira » → on ignore le libellé
    const content = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
    for (const name of splitList(content)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, category: "skill", evidence: line });
    }
  }
  return out;
}

function parseLanguages(lines: string[]): Language[] {
  const out: Language[] = [];
  for (const line of lines) {
    for (const part of line.split(/[,;•|]|\s[-–]\s/)) {
      const m = part.match(/^\s*([\p{L}' -]+?)\s*(?:\(([^)]+)\)|[:–-]\s*(.+))?\s*$/u);
      if (!m?.[1] || !LANGUAGE_NAMES.test(m[1])) continue;
      out.push({ name: m[1].trim(), level: (m[2] ?? m[3])?.trim() || null, evidence: line });
    }
  }
  return out;
}

export function parseResumeHeuristically(text: string): ResumeProfile {
  const profile = emptyProfile();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // En-tête : tout ce qui précède la première section.
  const sections: Record<SectionKey, string[]> = { summary: [], experience: [], education: [], skills: [], languages: [], other: [] };
  const header: string[] = [];
  let currentSection: SectionKey | null = null;
  for (const line of lines) {
    const section = detectSection(line);
    if (section) {
      currentSection = section;
      continue;
    }
    if (currentSection) sections[currentSection].push(line);
    else header.push(line);
  }

  const email = text.match(EMAIL_RE)?.[0] ?? null;
  const phone = text.match(PHONE_RE)?.[0] ?? null;
  const nameLine = header.slice(0, 3).find(looksLikeName) ?? null;
  const headlineLine =
    header.find((l) => l !== nameLine && !EMAIL_RE.test(l) && !PHONE_RE.test(l) && !URL_RE.test(l) && l.length <= 80) ?? null;
  const contactLine = header.find((l) => EMAIL_RE.test(l) || PHONE_RE.test(l));
  const location =
    contactLine
      ?.split(/\s*[|•·]\s*/)
      .map((s) => s.trim())
      .find((s) => s && !EMAIL_RE.test(s) && !PHONE_RE.test(s) && !URL_RE.test(s) && /^[\p{L}' -]{2,40}$/u.test(s)) ?? null;

  profile.identity = { fullName: nameLine, headline: headlineLine, email, phone, location };
  profile.summary = sections.summary.length ? sections.summary.join(" ").slice(0, 2000) : null;
  profile.experiences = parseExperiences(sections.experience);
  profile.education = parseEducation(sections.education);
  profile.skills = parseSkills(sections.skills);
  profile.languages = parseLanguages(sections.languages);
  return profile;
}

export interface Gap {
  key: string;
  message: string;
}

/** Informations manquantes ou à renforcer. Constats factuels sur le texte, jamais un jugement sur le candidat. */
export function detectGaps(profile: ResumeProfile): Gap[] {
  const gaps: Gap[] = [];
  const { identity } = profile;
  if (!identity.email) gaps.push({ key: "email", message: "Aucune adresse email n'a été trouvée dans le CV." });
  if (!identity.phone) gaps.push({ key: "phone", message: "Aucun numéro de téléphone n'a été trouvé." });
  if (!identity.location) gaps.push({ key: "location", message: "Votre localisation n'apparaît pas clairement." });
  if (profile.experiences.length === 0) {
    gaps.push({ key: "experiences", message: "Aucune expérience n'a pu être identifiée. Vérifiez la section ou ajoutez-les." });
  } else {
    const undated = profile.experiences.filter((x) => !x.startDate).length;
    if (undated) gaps.push({ key: "dates", message: `${undated} expérience(s) sans dates identifiables.` });
    const achievements = profile.experiences.flatMap((x) => x.achievements);
    if (achievements.length === 0) {
      gaps.push({ key: "achievements", message: "Aucune réalisation n'a été trouvée sous vos expériences." });
    } else if (!achievements.some((a) => QUANTIFIED_RE.test(a))) {
      gaps.push({
        key: "quantified",
        message: "Aucune réalisation chiffrée n'a été détectée. Si vous disposez de résultats mesurables, ils rendent votre CV plus concret.",
      });
    }
  }
  if (profile.skills.length === 0) gaps.push({ key: "skills", message: "Aucune section de compétences n'a été identifiée." });
  if (profile.education.length === 0) gaps.push({ key: "education", message: "Aucune formation n'a été identifiée." });
  if (profile.languages.length === 0) gaps.push({ key: "languages", message: "Aucune langue n'a été identifiée." });
  return gaps;
}

export function isQuantified(achievement: string): boolean {
  return QUANTIFIED_RE.test(achievement);
}
