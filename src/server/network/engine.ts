import { normalizeCompanyName } from "@/lib/normalize";
import { normalizeForMatch } from "@/server/cv/grounding";
import type { ApplicationStatus } from "@/config/domain";
import type { RelevanceInputs } from "./relevance";

/**
 * Moteur de pertinence du réseau (niveau 1).
 * Toutes les déductions portent sur des informations professionnelles déclarées (fonction, service, lieu,
 * connexion commune). Aucune caractéristique personnelle n'est utilisée.
 */

export type RoleType = "peer" | "manager" | "recruiter" | "hr" | "alumni" | "mutual" | "other";
export type Strategy = "peer" | "manager" | "recruiter";

const SENIORITY = new Set(
  ("senior junior confirme confirmee experimente stagiaire stage alternant alternante alternance apprenti h f hf fh cdi cdd freelance interim " +
    "de du des la le les et en a au aux pour equipe equipes team service pole departement direction division").split(" "),
);
const MANAGER_RE = /\b(head|lead|leader|manager|responsable|directeur|directrice|director|chef|vp|vice president|cto|cpo|ceo|coo|cfo|cmo|principal|team lead)\b/;
const RECRUITER_RE = /\b(recrut\w*|recruiter|recruiting|talent\w*|acquisition|sourc\w*)\b/;
const HR_RE = /\b(rh|drh|hrbp|hr|ressources humaines|human resources|people)\b/;
const MANAGER_WORDS = new Set("head lead leader manager responsable directeur directrice director chef vp vice president principal of team".split(" "));

/** Mots métier d'un intitulé (sans séniorité, ni mots de management, ni H/F). */
export function domainTokens(title: string | null | undefined): string[] {
  if (!title) return [];
  return normalizeForMatch(title.replace(/\([^)]*\)/g, " "))
    .replace(/[^a-z0-9+# ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !SENIORITY.has(w) && !MANAGER_WORDS.has(w));
}

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 6;
}

/** Part des mots métier de `target` retrouvés dans `candidate` (0..1), ou null si l'un est vide. */
export function tokenOverlap(candidate: string[], target: string[]): number | null {
  if (!candidate.length || !target.length) return null;
  return target.filter((t) => candidate.some((c) => similar(c, t))).length / target.length;
}

export function classifyRole(title: string | null | undefined, jobTitle?: string | null): RoleType {
  if (!title) return "other";
  const t = normalizeForMatch(title);
  if (RECRUITER_RE.test(t)) return "recruiter";
  if (HR_RE.test(t)) return "hr";
  if (MANAGER_RE.test(t)) return "manager";
  const overlap = tokenOverlap(domainTokens(title), domainTokens(jobTitle));
  return overlap && overlap > 0 ? "peer" : "other";
}

/** Ville principale d'un lieu (« Paris 9e », « Lyon (69) », « Bordeaux, France » → ville). */
export function cityOf(location: string | null | undefined): string | null {
  if (!location) return null;
  const n = normalizeForMatch(location);
  if (/teletravail|remote|full remote|a distance/.test(n)) return null;
  const first = n.split(/[,(/|-]/)[0]!.replace(/\b\d+(e|er|eme)?\b/g, "").replace(/\b(cedex|france)\b/g, "").trim();
  return first.length >= 2 ? first : null;
}

export interface ContactFacts {
  current_title: string | null;
  department: string | null;
  work_location: string | null;
  role_type: RoleType;
  has_mutual_connection: boolean;
  mutual_connection_note: string | null;
}

export interface ApplicationFacts {
  job_title: string;
  location: string | null;
  department: string | null;
  status: ApplicationStatus;
}

export function relevanceInputs(c: ContactFacts, a: ApplicationFacts): RelevanceInputs {
  const jobTokens = domainTokens(a.job_title);
  const titleOverlap = tokenOverlap(domainTokens(c.current_title), jobTokens);

  const roleProximity =
    titleOverlap === null
      ? { value: null, reason: "" }
      : titleOverlap >= 0.99
        ? { value: 1, reason: `Même métier que le poste visé (« ${c.current_title} »).` }
        : titleOverlap > 0
          ? { value: 0.5, reason: `Métier voisin du poste visé (« ${c.current_title} »).` }
          : { value: 0, reason: `Fonction différente du poste visé (« ${c.current_title} »).` };

  const deptTarget = a.department ? domainTokens(a.department) : jobTokens;
  const deptOverlap = c.department ? tokenOverlap(domainTokens(c.department), deptTarget) : null;
  const departmentProximity =
    deptOverlap === null
      ? { value: null, reason: "" }
      : deptOverlap > 0
        ? { value: deptOverlap >= 0.99 ? 1 : 0.6, reason: `Service « ${c.department} »${a.department ? `, proche du service « ${a.department} » de l'offre` : ", lié au métier visé"}.` }
        : { value: 0, reason: `Service « ${c.department} », distinct du poste visé.` };

  const hiringRole = (() => {
    switch (c.role_type) {
      case "recruiter":
      case "hr":
        return { value: 1, reason: "Fonction recrutement ou RH : interlocuteur du processus de recrutement." };
      case "manager":
        return { value: 0.75, reason: "Fonction d'encadrement : peut participer au recrutement (non vérifié)." };
      case "peer":
        return { value: 0.25, reason: "Futur collègue potentiel : peut renseigner sur l'équipe, rarement décisionnaire." };
      default:
        return { value: null, reason: "" };
    }
  })();

  const mutualConnection = c.has_mutual_connection
    ? { value: 1, reason: c.mutual_connection_note?.trim() || "Connexion commune déclarée par vous." }
    : { value: null, reason: "" };

  const ca = cityOf(c.work_location);
  const cb = cityOf(a.location);
  const geography =
    ca && cb
      ? ca === cb
        ? { value: 1, reason: `Même ville (${c.work_location}).` }
        : { value: 0, reason: `Lieux différents (${c.work_location} / ${a.location}).` }
      : { value: null, reason: "" };

  return { roleProximity, departmentProximity, hiringRole, mutualConnection, geography };
}

export function strategyForRole(role: RoleType): Strategy {
  if (role === "recruiter" || role === "hr") return "recruiter";
  if (role === "manager") return "manager";
  return "peer";
}

export const STRATEGIES: Record<Strategy, { label: string; goal: string; ask: string }> = {
  peer: {
    label: "Futur collègue",
    goal: "S'informer sur le métier, l'équipe et le processus de recrutement.",
    ask: "Demandez 15 minutes d'échange ou une question précise sur l'équipe. Ne demandez pas de recommandation au premier message.",
  },
  manager: {
    label: "Manager pertinent",
    goal: "Présenter brièvement votre intérêt pour le poste, sans présumer qu'il décide.",
    ask: "Résumez en une phrase ce que vous apportez au poste, puis demandez si un échange est possible.",
  },
  recruiter: {
    label: "Recruteur",
    goal: "Exprimer votre intérêt et poser des questions précises sur le poste ou le processus.",
    ask: "Indiquez le poste visé, une raison concrète de votre intérêt, et une question sur les prochaines étapes.",
  },
};

export interface RankedContact {
  id: string;
  role_type: RoleType;
  has_mutual_connection: boolean;
  score: number;
  roleProximity: number | null;
  departmentProximity: number | null;
  do_not_contact: boolean;
}

const NOT_SENT: ApplicationStatus[] = ["to_analyze", "to_prepare", "ready_to_send"];

/**
 * Stratégie recommandée pour une candidature (spécification NETWORK_ENGINE §2.4) :
 * recruteur identifié et candidature non envoyée → recruteur ; collègue avec connexion commune → collègue ;
 * manager proche du poste → manager ; sinon, le contact de meilleur score détermine la stratégie.
 */
export function recommendStrategy(
  contacts: RankedContact[],
  status: ApplicationStatus,
): { contactId: string; strategy: Strategy; reason: string } | null {
  const eligible = contacts.filter((c) => !c.do_not_contact).sort((a, b) => b.score - a.score);
  if (!eligible.length) return null;

  const recruiter = eligible.find((c) => c.role_type === "recruiter" || c.role_type === "hr");
  if (recruiter && NOT_SENT.includes(status)) {
    return { contactId: recruiter.id, strategy: "recruiter", reason: "Un recruteur est identifié et votre candidature n'est pas encore envoyée : c'est le bon moment pour exprimer votre intérêt." };
  }
  const peer = eligible.find((c) => c.role_type === "peer" && c.has_mutual_connection);
  if (peer) {
    return { contactId: peer.id, strategy: "peer", reason: "Un futur collègue partage une connexion avec vous : un échange informel est le plus naturel." };
  }
  const manager = eligible.find((c) => c.role_type === "manager" && ((c.roleProximity ?? 0) >= 0.5 || (c.departmentProximity ?? 0) >= 0.5));
  if (manager) {
    return { contactId: manager.id, strategy: "manager", reason: "Un manager du service ou du métier visé est identifié." };
  }
  const best = eligible[0]!;
  return { contactId: best.id, strategy: strategyForRole(best.role_type), reason: "Contact le plus pertinent d'après les informations disponibles." };
}

/** Rattachement prudent : même entreprise seulement si les noms normalisés sont identiques. */
export function sameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCompanyName(a);
  return Boolean(na && na === normalizeCompanyName(b));
}
