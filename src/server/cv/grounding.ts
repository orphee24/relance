import type { ResumeProfile } from "@/lib/validation/resume-profile";

/** Normalisation tolérante pour comparer un extrait au texte source (casse, accents, espaces, tirets). */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGrounded(evidence: string | null | undefined, source: string): boolean {
  if (!evidence) return false;
  const e = normalizeForMatch(evidence);
  if (e.length < 2) return false;
  return normalizeForMatch(source).includes(e);
}

/** Le nom de l'élément doit lui-même apparaître dans la preuve (ex. compétence « Figma » dans « Figma, CSS »). */
function nameInEvidence(name: string, evidence: string): boolean {
  return normalizeForMatch(evidence).includes(normalizeForMatch(name));
}

/**
 * Ne conserve que les éléments dont la preuve figure réellement dans le CV.
 * C'est la garantie qu'aucune compétence, expérience ou formation n'est inventée,
 * que l'extraction vienne d'un modèle d'IA ou de l'analyseur déterministe.
 */
export function groundProfile(profile: ResumeProfile, source: string): { profile: ResumeProfile; rejected: number } {
  let rejected = 0;
  const keep = <T>(items: T[], ok: (item: T) => boolean) =>
    items.filter((item) => {
      const pass = ok(item);
      if (!pass) rejected++;
      return pass;
    });

  const identityField = (value: string | null) => (value && isGrounded(value, source) ? value : null);
  const identity = {
    fullName: identityField(profile.identity.fullName),
    headline: identityField(profile.identity.headline),
    email: identityField(profile.identity.email),
    phone: identityField(profile.identity.phone),
    location: identityField(profile.identity.location),
  };
  rejected += Object.keys(identity).filter(
    (k) => profile.identity[k as keyof typeof identity] && !identity[k as keyof typeof identity],
  ).length;

  const grounded: ResumeProfile = {
    identity,
    summary: profile.summary && isGrounded(profile.summary.slice(0, 120), source) ? profile.summary : null,
    experiences: keep(profile.experiences, (x) => isGrounded(x.evidence, source) && isGrounded(x.title, source)).map(
      (x) => ({ ...x, achievements: keep(x.achievements, (a) => isGrounded(a, source)) }),
    ),
    education: keep(profile.education, (x) => isGrounded(x.evidence, source) && isGrounded(x.degree, source)),
    skills: keep(profile.skills, (x) => isGrounded(x.evidence, source) && nameInEvidence(x.name, x.evidence)),
    languages: keep(profile.languages, (x) => isGrounded(x.evidence, source) && nameInEvidence(x.name, x.evidence)),
  };
  // `rejected` n'est lu qu'après l'exécution de tous les filtres.
  return { profile: grounded, rejected };
}
