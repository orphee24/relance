import { normalizeDomain } from "@/lib/normalize";

/** Sites d'emploi : leur domaine n'est jamais celui de l'entreprise qui recrute. */
const JOB_BOARDS = [
  "linkedin.com", "indeed.com", "indeed.fr", "welcometothejungle.com", "apec.fr", "hellowork.com", "francetravail.fr",
  "pole-emploi.fr", "monster.fr", "jobteaser.com", "glassdoor.fr", "glassdoor.com", "cadremploi.fr", "meteojob.com",
  "regionsjob.com", "keljob.com", "jobijoba.com", "talent.com", "lesjeudis.com", "free-work.com", "malt.fr",
  "teamtailor.com", "workable.com", "lever.co", "greenhouse.io", "smartrecruiters.com", "recruitee.com", "jobs.ashbyhq.com",
  "myworkdayjobs.com", "taleo.net", "successfactors.com", "flatchr.io", "digitalrecruiters.com", "breezy.hr",
];

/**
 * Domaine officiel probable de l'entreprise à partir du lien de l'offre.
 * Renvoie null pour un site d'emploi ou un logiciel de recrutement : on ne déduit jamais
 * l'identité de l'entreprise d'un domaine qui ne lui appartient pas.
 */
export function companyDomainFromOfferUrl(url: string | null): string | null {
  const domain = normalizeDomain(url);
  if (!domain) return null;
  return JOB_BOARDS.some((b) => domain === b || domain.endsWith(`.${b}`)) ? null : domain;
}
