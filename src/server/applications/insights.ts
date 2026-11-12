import type { ApplicationStatus } from "@/config/domain";

const DAY = 24 * 3600 * 1000;

/** Nombre de jours entiers entre deux dates (au jour près, fuseau neutre). */
export function daysBetween(fromIsoDate: string, now: Date): number {
  const from = Date.UTC(+fromIsoDate.slice(0, 4), +fromIsoDate.slice(5, 7) - 1, +fromIsoDate.slice(8, 10));
  const to = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((to - from) / DAY));
}

const WAITING: ApplicationStatus[] = ["sent", "no_response", "followed_up"];

export interface WaitingInfo {
  days: number;
  label: string;
  /** Faits constatés, jamais une interprétation du silence. */
  tone: "neutral" | "attention";
}

/**
 * Délai depuis l'envoi pour une candidature en attente.
 * Le silence n'est jamais présenté comme un refus.
 */
export function waitingInfo(status: ApplicationStatus, appliedAt: string | null, now = new Date()): WaitingInfo | null {
  if (!appliedAt || !WAITING.includes(status)) return null;
  const days = daysBetween(appliedAt, now);
  const label = days === 0 ? "Envoyée aujourd'hui" : days === 1 ? "Envoyée hier" : `Envoyée il y a ${days} jours`;
  return { days, label, tone: days >= 10 ? "attention" : "neutral" };
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(at: string | null, now = new Date()): DueState | null {
  if (!at) return null;
  const d = new Date(at);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t < startToday) return "overdue";
  if (t < startToday + DAY) return "today";
  if (t < startToday + 7 * DAY) return "soon";
  return "later";
}

/** Statuts qui demandent une confirmation explicite : on ne les déduit jamais d'un silence. */
export function requiresExplicitConfirmation(to: ApplicationStatus): string | null {
  if (to === "rejected") {
    return "Ne choisissez « Refusée » que si l'entreprise vous l'a indiqué. Une absence de réponse reste « Sans réponse ».";
  }
  if (to === "offer_received" || to === "accepted") return null;
  return null;
}
