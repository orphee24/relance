import type { MessageFormat } from "./checks";

/**
 * Modèles de messages (sans IA). Chaque phrase n'utilise que des faits enregistrés :
 * aucune familiarité, connexion ou compétence n'est ajoutée si elle n'existe pas dans les données.
 */

export const RECIPIENT_TYPES = {
  peer: "Futur collègue",
  manager: "Manager",
  recruiter: "Recruteur",
  alumni: "Ancien élève de mon école",
  mutual: "Contact commun",
  introducer: "Intermédiaire pour une introduction",
} as const;
export type RecipientType = keyof typeof RECIPIENT_TYPES;

export const TONES = { professional: "Professionnel", direct: "Direct", warm: "Chaleureux", formal: "Formel" } as const;
export type Tone = keyof typeof TONES;

export const PURPOSES = {
  first_contact: "Premier contact",
  follow_up: "Relance d'un message",
  thank_you: "Remerciement après un échange",
  intro_request: "Demande d'introduction",
  application_follow_up: "Relance de candidature",
} as const;
export type Purpose = keyof typeof PURPOSES;

export const FORMATS: Record<MessageFormat, string> = {
  note: "Note d'invitation (courte)",
  message: "Message",
  email: "Email",
};

export interface MessageFacts {
  recipient: { firstName: string | null; lastName: string | null; title: string | null };
  recipientType: RecipientType;
  company: string;
  jobTitle: string | null;
  /** L'utilisateur a déjà envoyé sa candidature. */
  applied: boolean;
  appliedOn: string | null; // AAAA-MM-JJ
  sender: { firstName: string | null; lastName: string | null; headline: string | null };
  /** Réalisation issue du CV vérifié, recopiée telle quelle. */
  strength: string | null;
  mutualNote: string | null;
  isAlumni: boolean;
  introTarget: string | null;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

function greeting(f: MessageFacts, tone: Tone): string {
  const { firstName, lastName } = f.recipient;
  if (!firstName && !lastName) return "Bonjour,";
  if (tone === "formal") return `Bonjour ${[firstName, lastName].filter(Boolean).join(" ")},`;
  return `Bonjour ${firstName ?? lastName},`;
}

function closing(f: MessageFacts, tone: Tone, format: MessageFormat): string {
  const name = [f.sender.firstName, f.sender.lastName].filter(Boolean).join(" ");
  if (format === "note") return f.sender.firstName ?? name;
  const line = { professional: "Bonne journée,", direct: "Merci d'avance,", warm: "Au plaisir d'échanger,", formal: "Je vous remercie par avance pour votre attention.\nBien cordialement," }[tone];
  return [line, name].filter(Boolean).join("\n");
}

const poste = (f: MessageFacts) => (f.jobTitle ? `le poste de ${f.jobTitle}` : "un poste");

function context(f: MessageFacts, purpose: Purpose): string {
  const role = f.recipient.title ? ` en tant que ${f.recipient.title}` : "";
  switch (purpose) {
    case "follow_up":
      return `Je me permets de revenir vers vous au sujet de mon précédent message concernant ${poste(f)} chez ${f.company}.`;
    case "thank_you":
      return `Merci pour le temps que vous m'avez accordé au sujet de ${poste(f)} chez ${f.company}.`;
    case "intro_request":
      return `Je m'intéresse à ${poste(f)} chez ${f.company}, et je crois que vous connaissez des personnes dans cette entreprise.`;
    case "application_follow_up":
      return f.appliedOn
        ? `J'ai candidaté le ${dateFmt.format(new Date(`${f.appliedOn}T12:00:00Z`))} pour ${poste(f)} chez ${f.company}, et je me permets de revenir vers vous.`
        : `J'ai candidaté pour ${poste(f)} chez ${f.company}, et je me permets de revenir vers vous.`;
    default:
      break;
  }
  switch (f.recipientType) {
    case "manager":
      return `${f.applied ? "J'ai candidaté" : "Je m'apprête à candidater"} pour ${poste(f)} chez ${f.company}, et je vois que vous y travaillez${role}.`;
    case "recruiter":
      return `${poste(f).charAt(0).toUpperCase()}${poste(f).slice(1)} chez ${f.company} retient toute mon attention${f.applied ? ", et j'y ai déposé ma candidature" : ""}.`;
    case "alumni":
      return `Nous sommes passés par la même école, et je vois que vous travaillez chez ${f.company}${role}. Je m'intéresse à ${poste(f)}.`;
    case "mutual":
      return f.mutualNote
        ? `Nous avons une connexion en commun (${f.mutualNote}). Je m'intéresse à ${poste(f)} chez ${f.company}.`
        : `Je m'intéresse à ${poste(f)} chez ${f.company}.`;
    case "introducer":
      return `Je m'intéresse à ${poste(f)} chez ${f.company}, et je crois que vous connaissez des personnes dans cette entreprise.`;
    default:
      return `Je m'intéresse à ${poste(f)} chez ${f.company}, et je vois que vous y travaillez${role}.`;
  }
}

function value(f: MessageFacts, purpose: Purpose): string | null {
  if (purpose === "thank_you" || purpose === "follow_up") return null;
  const intro = f.sender.headline ? `Je suis ${f.sender.headline}.` : null;
  const proof = f.strength ? `Une réalisation récente : ${f.strength.trim().replace(/[.;]$/, "")}.` : null;
  return [intro, proof].filter(Boolean).join(" ") || null;
}

function ask(f: MessageFacts, purpose: Purpose): string {
  switch (purpose) {
    case "thank_you":
      return "N'hésitez pas à me dire si je peux vous être utile à mon tour.";
    case "follow_up":
      return "Auriez-vous quelques minutes pour en parler cette semaine ou la suivante ?";
    case "intro_request":
      return `Accepteriez-vous de me présenter à ${f.introTarget ?? "une personne de l'équipe concernée"} ? Je peux vous envoyer un court texte à transmettre.`;
    case "application_follow_up":
      return "Pourriez-vous m'indiquer où en est le processus de recrutement, et si ma candidature est toujours à l'étude ?";
    default:
      break;
  }
  switch (f.recipientType) {
    case "manager":
      return "Seriez-vous disponible pour un court échange de 15 minutes ?";
    case "recruiter":
      return f.applied ? "Pourriez-vous m'indiquer les prochaines étapes du processus ?" : "Y a-t-il un point sur lequel vous me conseilleriez d'insister dans ma candidature ?";
    case "introducer":
      return `Accepteriez-vous de me présenter à ${f.introTarget ?? "une personne de l'équipe concernée"} ?`;
    default:
      return "Accepteriez-vous un échange de 15 minutes pour me parler de l'équipe et de votre quotidien ?";
  }
}

export function subjectFor(f: MessageFacts, purpose: Purpose): string {
  const job = f.jobTitle ?? "candidature";
  switch (purpose) {
    case "application_follow_up":
      return `Candidature ${job} — ${[f.sender.firstName, f.sender.lastName].filter(Boolean).join(" ")}`.trim();
    case "thank_you":
      return "Merci pour votre temps";
    case "intro_request":
      return `Demande d'introduction chez ${f.company}`;
    default:
      return `${job} chez ${f.company}`;
  }
}

export function renderTemplate(f: MessageFacts, opts: { purpose: Purpose; tone: Tone; format: MessageFormat }): { subject: string | null; body: string } {
  const { purpose, tone, format } = opts;
  const parts =
    format === "note"
      ? [greeting(f, tone), `${context(f, purpose)} ${ask(f, purpose)}`, closing(f, tone, format)]
      : [greeting(f, tone), [context(f, purpose), value(f, purpose)].filter(Boolean).join(" "), ask(f, purpose), closing(f, tone, format)];
  let body = parts.filter(Boolean).join(format === "note" ? "\n" : "\n\n");
  if (tone === "direct") body = body.replace(" et je me permets de revenir vers vous", " et je reviens vers vous");
  return { subject: format === "email" ? subjectFor(f, purpose) : null, body };
}

/** Destinataire par défaut selon le rôle enregistré. */
export function defaultRecipient(role: string, hasMutual: boolean, isAlumni: boolean): RecipientType {
  if (role === "recruiter" || role === "hr") return "recruiter";
  if (role === "manager") return "manager";
  if (isAlumni) return "alumni";
  if (hasMutual && role !== "peer") return "mutual";
  return "peer";
}
