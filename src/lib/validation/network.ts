import { z } from "zod";

export const ROLE_LABELS = {
  auto: "Déterminer d'après la fonction",
  peer: "Futur collègue",
  manager: "Manager",
  recruiter: "Recruteur",
  hr: "Ressources humaines",
  alumni: "Ancien élève",
  mutual: "Contact commun",
  other: "Autre",
} as const;
export type RoleChoice = keyof typeof ROLE_LABELS;

export const NETWORK_STATUSES = [
  "identified", "to_contact", "message_ready", "contacted", "replied", "in_conversation",
  "intro_proposed", "intro_obtained", "no_response", "do_not_contact",
] as const;
export type NetworkStatus = (typeof NETWORK_STATUSES)[number];

export const PROVIDER_LABELS: Record<string, string> = {
  user_manual: "Saisi par vous",
  assisted_search: "Trouvé par recherche assistée",
  company_site: "Page officielle de l'entreprise",
  user_import: "Import de vos contacts",
  licensed_provider: "Fournisseur de données sous contrat",
};

export const INTERACTION_TYPES = {
  message_sent: "Message envoyé",
  reply_received: "Réponse reçue",
  call: "Appel",
  meeting: "Rencontre",
  intro_requested: "Introduction demandée",
  intro_made: "Introduction obtenue",
  note: "Note",
} as const;

export const INTERACTION_CHANNELS = {
  linkedin: "LinkedIn",
  email: "Email",
  phone: "Téléphone",
  in_person: "En personne",
  other: "Autre",
} as const;

const opt = (max: number) => z.string().trim().max(max, { error: `${max} caractères maximum.` }).transform((v) => v || null);
const checkbox = z.union([z.literal("on"), z.literal("")]).transform((v) => v === "on");

export const contactFormSchema = z
  .object({
    first_name: opt(100),
    last_name: opt(100),
    current_title: opt(300),
    company_name: opt(200),
    department: opt(200),
    work_location: opt(200),
    profile_url: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), { error: "Le lien du profil doit commencer par https://" })
      .transform((v) => v || null),
    role: z.enum(Object.keys(ROLE_LABELS) as [RoleChoice, ...RoleChoice[]]),
    provider: z.enum(["user_manual", "assisted_search", "company_site"]),
    source_url: z
      .string()
      .trim()
      .max(1000)
      .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), { error: "Lien invalide." })
      .transform((v) => v || null),
    has_mutual_connection: checkbox,
    mutual_connection_note: opt(500),
    is_alumni: checkbox,
    verified: checkbox,
    notes: opt(10000),
    application_id: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v))
      .transform((v) => v || null),
  })
  .superRefine((d, ctx) => {
    if (!d.first_name && !d.last_name) {
      ctx.addIssue({ code: "custom", path: ["last_name"], message: "Indiquez au moins le nom ou le prénom." });
    }
    if (d.verified && !d.profile_url && !d.source_url) {
      ctx.addIssue({ code: "custom", path: ["verified"], message: "Indiquez le lien du profil ou de la page consultée pour confirmer." });
    }
    if (d.has_mutual_connection && !d.mutual_connection_note) {
      ctx.addIssue({ code: "custom", path: ["mutual_connection_note"], message: "Précisez la connexion commune (qui, comment)." });
    }
  });
export type ContactForm = z.infer<typeof contactFormSchema>;

export const interactionFormSchema = z.object({
  type: z.enum(Object.keys(INTERACTION_TYPES) as [keyof typeof INTERACTION_TYPES, ...(keyof typeof INTERACTION_TYPES)[]]),
  channel: z
    .union([z.literal(""), z.enum(Object.keys(INTERACTION_CHANNELS) as [keyof typeof INTERACTION_CHANNELS, ...(keyof typeof INTERACTION_CHANNELS)[]])])
    .transform((v) => v || null),
  summary: opt(5000),
});

export const IMPORT_CONSENT_VERSION = "2026-11-12";
