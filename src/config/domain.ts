/** Libellés français des statuts (les valeurs correspondent aux enums SQL). */

export const APPLICATION_STATUSES = [
  "to_analyze",
  "to_prepare",
  "ready_to_send",
  "sent",
  "no_response",
  "followed_up",
  "interview_scheduled",
  "interview_done",
  "offer_received",
  "rejected",
  "withdrawn",
  "accepted",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  to_analyze: "À analyser",
  to_prepare: "À préparer",
  ready_to_send: "Prête à envoyer",
  sent: "Envoyée",
  no_response: "Sans réponse",
  followed_up: "Relancée",
  interview_scheduled: "Entretien programmé",
  interview_done: "Entretien effectué",
  offer_received: "Offre reçue",
  rejected: "Refusée",
  withdrawn: "Retirée",
  accepted: "Acceptée",
};

/** Regroupement pour le pipeline du tableau de bord. */
export const PIPELINE_STAGES: { key: string; label: string; statuses: ApplicationStatus[] }[] = [
  { key: "prep", label: "En préparation", statuses: ["to_analyze", "to_prepare", "ready_to_send"] },
  { key: "waiting", label: "En attente", statuses: ["sent", "no_response", "followed_up"] },
  { key: "interview", label: "Entretiens", statuses: ["interview_scheduled", "interview_done"] },
  { key: "offer", label: "Offres", statuses: ["offer_received", "accepted"] },
  { key: "closed", label: "Clôturées", statuses: ["rejected", "withdrawn"] },
];

/** « Sans réponse » n'est jamais un refus : seul `rejected` compte comme réponse négative. */
export const SENT_STATUSES: ApplicationStatus[] = [
  "sent", "no_response", "followed_up", "interview_scheduled", "interview_done",
  "offer_received", "rejected", "accepted",
];
export const RESPONDED_STATUSES: ApplicationStatus[] = [
  "interview_scheduled", "interview_done", "offer_received", "rejected", "accepted",
];
export const INTERVIEW_STATUSES: ApplicationStatus[] = [
  "interview_scheduled", "interview_done", "offer_received", "accepted",
];

export const NETWORK_CONTACT_STATUS_LABELS = {
  identified: "Identifié",
  to_contact: "À contacter",
  message_ready: "Message préparé",
  contacted: "Contacté",
  replied: "A répondu",
  in_conversation: "Échange en cours",
  intro_proposed: "Introduction proposée",
  intro_obtained: "Introduction obtenue",
  no_response: "Sans réponse",
  do_not_contact: "Ne plus contacter",
} as const;
