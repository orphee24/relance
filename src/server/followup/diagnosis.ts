import type { ApplicationStatus } from "@/config/domain";
import { CHANNELS, type Channel } from "@/lib/validation/application";
import { daysBetween } from "@/server/applications/insights";

/**
 * Diagnostic d'une candidature sans réponse : faits, hypothèses, inconnues, conseil.
 * Relance ne connaît jamais le motif d'un silence : les hypothèses sont présentées comme telles.
 */

export interface SilenceInput {
  status: ApplicationStatus;
  appliedAt: string | null;
  channel: string | null;
  followUps: { at: string }[];
  contacts: { total: number; contacted: number; replied: number };
  coverage: number | null;
  missingMandatory: string[];
  now?: Date;
}

export type Advice =
  | { kind: "wait"; untilDays: number; text: string }
  | { kind: "follow_up"; text: string }
  | { kind: "contact_person"; text: string }
  | { kind: "stop_following_up"; text: string }
  | { kind: "none"; text: string };

export interface Diagnosis {
  applicable: boolean;
  facts: string[];
  hypotheses: string[];
  unknowns: string[];
  advice: Advice;
}

export const FIRST_FOLLOW_UP_DAYS = 7;
export const BETWEEN_FOLLOW_UPS_DAYS = 7;
export const MAX_FOLLOW_UPS = 2;

const WAITING: ApplicationStatus[] = ["sent", "no_response", "followed_up"];
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function diagnoseSilence(input: SilenceInput): Diagnosis {
  const now = input.now ?? new Date();
  if (!WAITING.includes(input.status) || !input.appliedAt) {
    return { applicable: false, facts: [], hypotheses: [], unknowns: [], advice: { kind: "none", text: "" } };
  }
  const days = daysBetween(input.appliedAt, now);
  const followUps = [...input.followUps].sort((a, b) => b.at.localeCompare(a.at));
  const lastFollowUpDays = followUps[0] ? daysBetween(followUps[0].at.slice(0, 10), now) : null;

  const facts: string[] = [];
  facts.push(
    `Candidature envoyée le ${dateFmt.format(new Date(`${input.appliedAt}T12:00:00Z`))}${input.channel ? ` (${CHANNELS[input.channel as Channel] ?? input.channel})` : ""}, il y a ${plural(days, "jour", "jours")}.`,
  );
  facts.push(
    followUps.length
      ? `${plural(followUps.length, "relance envoyée", "relances envoyées")}, la dernière il y a ${plural(lastFollowUpDays ?? 0, "jour", "jours")}.`
      : "Aucune relance enregistrée.",
  );
  facts.push(
    input.contacts.total
      ? `${plural(input.contacts.total, "personne identifiée", "personnes identifiées")} dans l'entreprise, ${input.contacts.contacted} contactée${input.contacts.contacted > 1 ? "s" : ""}, ${input.contacts.replied} réponse${input.contacts.replied > 1 ? "s" : ""}.`
      : "Aucune personne identifiée dans l'entreprise.",
  );
  if (input.coverage !== null) {
    facts.push(
      `Couverture estimée de l'offre par votre CV : ${Math.round(input.coverage)} %${input.missingMandatory.length ? `, critère${input.missingMandatory.length > 1 ? "s" : ""} obligatoire${input.missingMandatory.length > 1 ? "s" : ""} non démontré${input.missingMandatory.length > 1 ? "s" : ""} : ${input.missingMandatory.slice(0, 3).join(" ; ")}` : ""}.`,
    );
  }

  const hypotheses: string[] = ["Le recrutement peut simplement être en cours : beaucoup d'entreprises répondent en plusieurs semaines."];
  if (input.channel === "job_board") {
    hypotheses.push("Les offres publiées sur les sites d'emploi reçoivent souvent de nombreuses candidatures : un contact direct peut aider à être lu.");
  }
  if (input.missingMandatory.length) {
    hypotheses.push("Un critère obligatoire que votre CV ne démontre pas a pu compter dans le tri. Ce n'est qu'une possibilité.");
  }
  if (days > 30) hypotheses.push("Le poste a pu être pourvu ou mis en pause.");

  const unknowns = [
    "Si votre candidature a été lue.",
    "Le nombre de candidats et l'avancement du processus.",
    "Si le poste est toujours ouvert.",
  ];

  let advice: Advice;
  if (followUps.length >= MAX_FOLLOW_UPS) {
    advice = input.contacts.total > input.contacts.contacted
      ? { kind: "contact_person", text: "Vous avez déjà relancé deux fois : n'insistez plus par ce canal. Un échange avec une personne de l'équipe est la meilleure piste restante." }
      : { kind: "stop_following_up", text: "Vous avez déjà relancé deux fois : n'insistez plus. Concentrez-vous sur d'autres candidatures ; vous pourrez archiver celle-ci." };
  } else if (followUps.length === 0 && days < FIRST_FOLLOW_UP_DAYS) {
    advice = { kind: "wait", untilDays: FIRST_FOLLOW_UP_DAYS - days, text: `Il est encore tôt. Une relance est pertinente dans ${plural(FIRST_FOLLOW_UP_DAYS - days, "jour", "jours")} ; d'ici là, identifier une personne dans l'équipe est utile.` };
  } else if (lastFollowUpDays !== null && lastFollowUpDays < BETWEEN_FOLLOW_UPS_DAYS) {
    advice = { kind: "wait", untilDays: BETWEEN_FOLLOW_UPS_DAYS - lastFollowUpDays, text: `Dernière relance récente. Attendez encore ${plural(BETWEEN_FOLLOW_UPS_DAYS - lastFollowUpDays, "jour", "jours")} avant d'en envoyer une autre.` };
  } else if (input.contacts.total > input.contacts.contacted && followUps.length === 1) {
    advice = { kind: "contact_person", text: "Une relance est déjà partie. Contacter une personne identifiée dans l'équipe est souvent plus efficace qu'une seconde relance." };
  } else {
    advice = { kind: "follow_up", text: `Une relance courte et polie est appropriée (${followUps.length ? "seconde et dernière" : "première"} relance).` };
  }

  return { applicable: true, facts, hypotheses, unknowns, advice };
}
