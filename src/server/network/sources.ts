import { normalizeDomain } from "@/lib/normalize";
import { normalizeForMatch } from "@/server/cv/grounding";

// --- Recherche assistée ----------------------------------------------------------

export interface SearchLink {
  key: string;
  label: string;
  purpose: string;
  url: string;
  engine: "LinkedIn" | "Google";
}

/** Intitulé de poste utilisable dans une recherche (sans « (H/F) », séniorité conservée hors requête). */
export function jobCore(jobTitle: string): string {
  return jobTitle
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(h\s*\/\s*f|f\s*\/\s*h)\b/gi, " ")
    .replace(/\b(senior|junior|confirm[ée]e?|stagiaire|alternant\w*)\b/gi, " ")
    .replace(/[-–—|].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const linkedin = (keywords: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=GLOBAL_SEARCH_HEADER`;
const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const quote = (s: string) => `"${s.replace(/"/g, "")}"`;

/**
 * Requêtes ciblées que l'utilisateur ouvre lui-même, connecté à ses propres comptes.
 * Relance ne lance aucune requête et ne récupère aucun résultat.
 */
export function buildSearchLinks(input: { company: string; jobTitle: string; domain?: string | null }): SearchLink[] {
  const company = input.company.trim();
  const core = jobCore(input.jobTitle) || input.jobTitle.trim();
  const domain = normalizeDomain(input.domain ?? null);

  const links: SearchLink[] = [
    { key: "peers-li", label: "Futurs collègues", purpose: "Personnes exerçant le même métier dans l'entreprise.", engine: "LinkedIn", url: linkedin(`${company} ${core}`) },
    { key: "peers-g", label: "Futurs collègues", purpose: "Profils publics au même métier, via un moteur de recherche.", engine: "Google", url: google(`site:linkedin.com/in ${quote(company)} ${quote(core)}`) },
    { key: "managers-g", label: "Managers", purpose: "Responsables de l'équipe ou du métier visé.", engine: "Google", url: google(`site:linkedin.com/in ${quote(company)} ("head of" OR lead OR manager OR responsable OR directeur) ${core}`) },
    { key: "recruiters-li", label: "Recruteurs", purpose: "Chargés de recrutement et talent acquisition.", engine: "LinkedIn", url: linkedin(`${company} talent acquisition recrutement`) },
    { key: "recruiters-g", label: "Recruteurs", purpose: "Chargés de recrutement et RH, via un moteur de recherche.", engine: "Google", url: google(`site:linkedin.com/in ${quote(company)} (recruteur OR recruteuse OR "talent acquisition" OR recruiter OR "chargée de recrutement")`) },
    {
      key: "team-page",
      label: "Page équipe officielle",
      purpose: "Pages « équipe » ou « qui sommes-nous » publiées par l'entreprise.",
      engine: "Google",
      url: google(domain ? `site:${domain} (équipe OR team OR "qui sommes-nous" OR "notre équipe")` : `${quote(company)} ("notre équipe" OR "our team" OR "qui sommes-nous")`),
    },
  ];
  return links;
}

// --- Extraction d'une page « équipe » collée par l'utilisateur ------------------------

export interface PersonCandidate {
  firstName: string;
  lastName: string;
  title: string | null;
  line: string;
}

const PARTICLES = new Set(["de", "du", "des", "da", "di", "van", "von", "der", "le", "la", "d'", "el", "al", "ben", "bin"]);
const NOT_NAMES = /^(notre|nos|our|the|meet|rencontrez|rejoignez|join|en savoir|voir|lire|contact|l'équipe|equipe|team|direction|comité|board|leadership|à propos|qui sommes)/i;

const JOB_WORDS = new Set(
  ("lead head manager director directeur directrice responsable chef designer developer developpeur developpeuse ingenieur ingenieure engineer " +
    "product produit talent acquisition partner consultant consultante analyst analyste charge chargee assistant assistante coordinateur " +
    "coordinatrice officer associate comptable commercial commerciale marketing sales ux ui data ceo cto cfo coo cpo founder co-founder " +
    "fondateur fondatrice president presidente stagiaire alternant recruteur recruteuse recruiter rh hr people office business senior junior").split(" "),
);
const NOT_TITLES = /^(en savoir plus|voir|lire|contact|d[ée]couvrir|linkedin|suivre|rejoignez|join|read more|learn more|plus d'infos)/i;

export function looksLikePersonName(s: string): boolean {
  const t = s.trim();
  if (t.length < 4 || t.length > 50 || /[\d@:/|•]/.test(t) || NOT_NAMES.test(t)) return false;
  if (t.split(/\s+/).some((w) => JOB_WORDS.has(normalizeForMatch(w).replace(/[^a-z-]/g, "")))) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  let mixedCase = false;
  for (const w of words) {
    if (PARTICLES.has(w.toLowerCase())) continue;
    if (!/^[\p{Lu}][\p{L}'’.-]*$/u.test(w)) return false;
    if (/\p{Ll}/u.test(w)) mixedCase = true;
  }
  return mixedCase;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/);
  // « MARTIN Claire » : le mot entièrement en capitales est le nom de famille
  const upperIdx = words.findIndex((w) => w.length > 1 && w === w.toLocaleUpperCase("fr-FR") && /\p{L}{2}/u.test(w));
  if (upperIdx === 0 && words.length > 1) return { lastName: words[0]!, firstName: words.slice(1).join(" ") };
  return { firstName: words[0]!, lastName: words.slice(1).join(" ") };
}

const looksLikeTitle = (s: string) => s.length >= 2 && s.length <= 90 && !looksLikePersonName(s) && !/https?:|@/.test(s) && !NOT_TITLES.test(s.trim());

/** Extrait les paires nom / fonction d'un texte de page « équipe ». Rien n'est enregistré sans confirmation. */
export function extractPeopleFromText(text: string, max = 100): PersonCandidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: PersonCandidate[] = [];
  const seen = new Set<string>();
  const push = (name: string, title: string | null, line: string) => {
    const key = normalizeForMatch(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...splitName(name), title: title?.replace(/^[\s,–—|-]+|[\s,–—|-]+$/g, "") || null, line });
  };

  for (let i = 0; i < lines.length && out.length < max; i++) {
    const line = lines[i]!;
    const inline = line.match(/^(.+?)\s*(?:—|–|-|\||,|:)\s+(.+)$/);
    if (inline && looksLikePersonName(inline[1]!) && looksLikeTitle(inline[2]!)) {
      push(inline[1]!, inline[2]!, line);
      continue;
    }
    if (looksLikePersonName(line)) {
      const next = lines[i + 1];
      if (next && looksLikeTitle(next)) {
        push(line, next, `${line}\n${next}`);
        i++;
      } else push(line, null, line);
    }
  }
  return out;
}

// --- Import de contacts (CSV exporté par l'utilisateur depuis son propre réseau) ------

export interface ImportedContact {
  first_name: string | null;
  last_name: string | null;
  profile_url: string | null;
  company_name: string | null;
  current_title: string | null;
}

export interface CsvImportResult {
  rows: ImportedContact[];
  total: number;
  skipped: number;
  /** Une colonne email était présente : elle a été ignorée et n'est jamais stockée. */
  ignoredEmailColumn: boolean;
  error?: string;
}

/** Analyse CSV (RFC 4180) : guillemets, retours à la ligne dans les champs, séparateur , ou ;. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLUMN_ALIASES: Record<keyof ImportedContact | "email", string[]> = {
  first_name: ["first name", "prenom", "firstname", "given name"],
  last_name: ["last name", "nom", "lastname", "family name", "nom de famille"],
  profile_url: ["url", "profile url", "linkedin url", "lien du profil", "profil"],
  company_name: ["company", "entreprise", "societe", "organisation", "organization"],
  current_title: ["position", "poste", "title", "fonction", "job title", "intitule"],
  email: ["email address", "email", "e-mail", "adresse e-mail", "adresse email", "courriel"],
};

export const MAX_IMPORT_ROWS = 2000;

export function parseContactsCsv(text: string): CsvImportResult {
  const table = parseCsv(text);
  const norm = (s: string) => normalizeForMatch(s).replace(/[^a-z ]/g, "").trim();
  const headerIdx = table.findIndex((r) => {
    const cells = r.map(norm);
    return COLUMN_ALIASES.first_name.some((a) => cells.includes(a)) && COLUMN_ALIASES.last_name.some((a) => cells.includes(a));
  });
  if (headerIdx === -1) {
    return { rows: [], total: 0, skipped: 0, ignoredEmailColumn: false, error: "Colonnes « First Name » et « Last Name » (ou « Prénom » et « Nom ») introuvables." };
  }
  const header = table[headerIdx]!.map(norm);
  const col = (k: keyof typeof COLUMN_ALIASES) => header.findIndex((h) => COLUMN_ALIASES[k].includes(h));
  const idx = { first: col("first_name"), last: col("last_name"), url: col("profile_url"), company: col("company_name"), title: col("current_title") };
  const ignoredEmailColumn = col("email") !== -1;

  const body = table.slice(headerIdx + 1);
  const rows: ImportedContact[] = [];
  let skipped = 0;
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() || null : null);
  for (const r of body.slice(0, MAX_IMPORT_ROWS)) {
    const first = cell(r, idx.first)?.slice(0, 100) ?? null;
    const last = cell(r, idx.last)?.slice(0, 100) ?? null;
    if (!first && !last) {
      skipped++;
      continue;
    }
    const url = cell(r, idx.url);
    rows.push({
      first_name: first,
      last_name: last,
      profile_url: url && /^https:\/\/\S+$/i.test(url) ? url.slice(0, 500) : null,
      company_name: cell(r, idx.company)?.slice(0, 200) ?? null,
      current_title: cell(r, idx.title)?.slice(0, 300) ?? null,
    });
  }
  skipped += Math.max(0, body.length - MAX_IMPORT_ROWS);
  return { rows, total: body.length, skipped, ignoredEmailColumn };
}
