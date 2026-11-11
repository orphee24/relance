/**
 * Miroir TypeScript des fonctions SQL `normalize_text` et `normalize_company_name`
 * (supabase/migrations/…_core_schema.sql). Toute modification doit être faite des deux côtés.
 */

const LEGAL_FORMS = [
  "sa", "sas", "sasu", "sarl", "eurl", "sca", "snc", "se", "scop",
  "group", "groupe", "holding", "inc", "ltd", "llc", "gmbh", "plc",
];
const LEGAL_FORMS_RE = new RegExp(`\\b(${LEGAL_FORMS.join("|")})\\b`, "g");

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const out = stripAccents(value).toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
  return out.length > 0 ? out : null;
}

export function normalizeCompanyName(value: string | null | undefined): string | null {
  if (!value) return null;
  const lowered = stripAccents(value).toLowerCase();
  const out = lowered
    .replace(LEGAL_FORMS_RE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return out.length > 0 ? out : null;
}

export function applicationDedupeKey(companyName: string, jobTitle: string): string {
  return `${normalizeCompanyName(companyName) ?? ""}|${normalizeText(jobTitle) ?? ""}`;
}

/** Domaine officiel à partir d'une URL ou d'un domaine saisi ; null si invalide. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}
