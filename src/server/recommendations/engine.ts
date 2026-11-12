import type { ApplicationStatus } from "@/config/domain";
import { daysBetween } from "@/server/applications/insights";
import { BETWEEN_FOLLOW_UPS_DAYS, FIRST_FOLLOW_UP_DAYS, MAX_FOLLOW_UPS } from "@/server/followup/diagnosis";

/**
 * Next Best Action : jusqu'à 3 actions par jour, chacune avec sa justification factuelle.
 * Moteur déterministe : mêmes données, mêmes recommandations. Aucune action vers une personne
 * « Ne plus contacter », pas plus de 2 relances sans réponse.
 */

export type RecommendationKind =
  | "follow_up_application" | "finalize_resume" | "contact_person" | "prepare_interview"
  | "verify_offer" | "reconnect_recruiter" | "reply_message" | "close_application";

export interface Candidate {
  kind: RecommendationKind;
  priority: number; // 1..100
  title: string;
  reason: string;
  applicationId: string | null;
  networkContactId: string | null;
}

export interface Snapshot {
  now: Date;
  hasVerifiedResume: boolean;
  hasUnverifiedResume: boolean;
  applications: {
    id: string;
    company: string;
    jobTitle: string;
    status: ApplicationStatus;
    appliedAt: string | null;
    nextActionAt: string | null;
    hasAnalysis: boolean;
    followUps: string[]; // dates ISO
    archived: boolean;
  }[];
  contacts: {
    networkId: string;
    name: string;
    status: string;
    followUps: number;
    lastInteractionAt: string | null;
    lastInteractionType: string | null;
    applicationIds: string[];
    score: number | null;
    roleType: string;
  }[];
}

const clamp = (n: number) => Math.max(1, Math.min(100, Math.round(n)));
const ACTIVE: ApplicationStatus[] = ["to_analyze", "to_prepare", "ready_to_send", "sent", "no_response", "followed_up", "interview_scheduled", "interview_done", "offer_received"];
const WAITING: ApplicationStatus[] = ["sent", "no_response", "followed_up"];

export function buildCandidates(s: Snapshot): Candidate[] {
  const out: Candidate[] = [];
  const apps = s.applications.filter((a) => !a.archived && ACTIVE.includes(a.status));
  const appLabel = (id: string) => {
    const a = s.applications.find((x) => x.id === id);
    return a ? `${a.jobTitle} — ${a.company}` : null;
  };

  // Réponses en attente de votre part
  for (const c of s.contacts) {
    if (c.status === "do_not_contact") continue;
    if (c.status === "replied" && c.lastInteractionType === "reply_received" && c.lastInteractionAt) {
      const d = daysBetween(c.lastInteractionAt.slice(0, 10), s.now);
      out.push({
        kind: "reply_message",
        priority: clamp(95 - Math.min(d, 10)),
        title: `Répondre à ${c.name}`,
        reason: `${c.name} vous a répondu il y a ${d === 0 ? "moins d'un jour" : `${d} jour${d > 1 ? "s" : ""}`}. Une réponse rapide entretient l'échange.`,
        applicationId: c.applicationIds[0] ?? null,
        networkContactId: c.networkId,
      });
    }
  }

  // CV
  if (!s.hasVerifiedResume && apps.length) {
    out.push({
      kind: "finalize_resume",
      priority: s.hasUnverifiedResume ? 88 : 85,
      title: s.hasUnverifiedResume ? "Vérifier votre CV importé" : "Importer et vérifier votre CV",
      reason: `Sans CV vérifié, Relance ne peut pas évaluer vos ${apps.length} candidature${apps.length > 1 ? "s" : ""} ni appuyer vos messages sur vos réalisations.`,
      applicationId: null,
      networkContactId: null,
    });
  }

  for (const a of apps) {
    // Entretiens
    if (a.status === "interview_scheduled") {
      const inDays = a.nextActionAt ? Math.ceil((new Date(a.nextActionAt).getTime() - s.now.getTime()) / 864e5) : null;
      out.push({
        kind: "prepare_interview",
        priority: inDays !== null && inDays >= 0 && inDays <= 3 ? 97 : 90,
        title: `Préparer l'entretien ${a.company}`,
        reason: inDays !== null && inDays >= 0 ? `Entretien prévu dans ${inDays === 0 ? "la journée" : `${inDays} jour${inDays > 1 ? "s" : ""}`} pour ${a.jobTitle}.` : `Un entretien est programmé pour ${a.jobTitle}.`,
        applicationId: a.id,
        networkContactId: null,
      });
      continue;
    }

    // Relances de candidature
    if (WAITING.includes(a.status) && a.appliedAt) {
      const days = daysBetween(a.appliedAt, s.now);
      const last = [...a.followUps].sort().pop();
      const sinceLast = last ? daysBetween(last.slice(0, 10), s.now) : null;
      if (a.followUps.length < MAX_FOLLOW_UPS && days >= FIRST_FOLLOW_UP_DAYS && (sinceLast === null || sinceLast >= BETWEEN_FOLLOW_UPS_DAYS)) {
        out.push({
          kind: "follow_up_application",
          priority: clamp(70 + Math.min(days, 20)),
          title: `Relancer ${a.company}`,
          reason: `Candidature envoyée il y a ${days} jours, ${a.followUps.length ? "une relance déjà envoyée il y a " + sinceLast + " jours" : "sans relance"}. Une absence de réponse n'est pas un refus.`,
          applicationId: a.id,
          networkContactId: null,
        });
      } else if (a.followUps.length >= MAX_FOLLOW_UPS && days >= 45) {
        out.push({
          kind: "close_application",
          priority: 35,
          title: `Faire le point sur ${a.company}`,
          reason: `Aucune réponse ${days} jours après l'envoi, malgré deux relances. Archiver la candidature libère de la place ; vous pourrez la restaurer.`,
          applicationId: a.id,
          networkContactId: null,
        });
      }
    }

    // Offre non analysée
    if (!a.hasAnalysis && ["to_analyze", "to_prepare", "ready_to_send"].includes(a.status)) {
      out.push({
        kind: "verify_offer",
        priority: 60,
        title: `Analyser l'offre ${a.company}`,
        reason: `Avant d'envoyer votre candidature pour ${a.jobTitle}, vérifiez quels critères votre CV démontre.`,
        applicationId: a.id,
        networkContactId: null,
      });
    }
  }

  // Personnes à contacter
  for (const c of s.contacts) {
    if (c.status === "do_not_contact") continue;
    const appId = c.applicationIds.find((id) => apps.some((a) => a.id === id));
    if (!appId) continue;
    if ((c.status === "identified" || c.status === "to_contact" || c.status === "message_ready") && (c.score ?? 0) >= 40) {
      out.push({
        kind: "contact_person",
        priority: clamp(62 + (c.score ?? 0) / 5),
        title: `Contacter ${c.name}`,
        reason: `Pertinence ${c.score}/100 pour ${appLabel(appId)}. Vous ne l'avez pas encore contacté${c.roleType === "recruiter" || c.roleType === "hr" ? " ; c'est un interlocuteur du recrutement" : ""}.`,
        applicationId: appId,
        networkContactId: c.networkId,
      });
    } else if (c.status === "contacted" && c.followUps < MAX_FOLLOW_UPS && c.lastInteractionAt) {
      const d = daysBetween(c.lastInteractionAt.slice(0, 10), s.now);
      if (d >= 7) {
        out.push({
          kind: "reconnect_recruiter",
          priority: clamp(55 + Math.min(d, 15)),
          title: `Relancer ${c.name}`,
          reason: `Message envoyé il y a ${d} jours, sans réponse enregistrée${c.followUps ? ` (déjà ${c.followUps} relance)` : ""}. Une relance courte suffit.`,
          applicationId: appId,
          networkContactId: c.networkId,
        });
      }
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Les 3 actions du jour : une seule action par candidature et par personne. */
export function pickTop(candidates: Candidate[], max = 3): Candidate[] {
  const picked: Candidate[] = [];
  const usedApps = new Set<string>();
  const usedContacts = new Set<string>();
  for (const c of candidates) {
    if (c.applicationId && usedApps.has(c.applicationId)) continue;
    if (c.networkContactId && usedContacts.has(c.networkContactId)) continue;
    picked.push(c);
    if (c.applicationId) usedApps.add(c.applicationId);
    if (c.networkContactId) usedContacts.add(c.networkContactId);
    if (picked.length === max) break;
  }
  return picked;
}

export function hrefFor(c: { kind: RecommendationKind; applicationId: string | null; networkContactId: string | null }): string {
  switch (c.kind) {
    case "finalize_resume":
      return "/cv";
    case "reply_message":
    case "contact_person":
    case "reconnect_recruiter":
      return c.networkContactId ? `/reseau/${c.networkContactId}/message${c.applicationId ? `?candidature=${c.applicationId}` : ""}` : "/reseau";
    case "follow_up_application":
      return c.applicationId ? `/candidatures/${c.applicationId}/relance` : "/candidatures";
    case "verify_offer":
      return "/analyser";
    default:
      return c.applicationId ? `/candidatures/${c.applicationId}` : "/candidatures";
  }
}
