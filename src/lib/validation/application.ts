import { z } from "zod";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/config/domain";

export const CHANNELS = {
  job_board: "Site d'emploi",
  company_site: "Site carrière de l'entreprise",
  spontaneous: "Candidature spontanée",
  recruiter: "Cabinet ou recruteur",
  network_intro: "Introduction par le réseau",
  referral: "Cooptation",
  other: "Autre",
} as const;
export type Channel = keyof typeof CHANNELS;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${max} caractères maximum.` })
    .transform((v) => v || null);

const isoDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Date invalide." })
  .transform((v) => v || null);

const isoDateTime = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v), { error: "Date invalide." })
  .transform((v) => (v ? (v.length === 10 ? `${v}T09:00` : v) : null));

export const applicationFormSchema = z
  .object({
    company_name: z.string().trim().min(1, { error: "Indiquez l'entreprise." }).max(200),
    job_title: z.string().trim().min(1, { error: "Indiquez l'intitulé du poste." }).max(300),
    offer_url: z
      .string()
      .trim()
      .max(2000)
      .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), { error: "Lien invalide : il doit commencer par https://" })
      .transform((v) => v || null),
    location: optional(200),
    salary_text: optional(200),
    contract_type: z
      .union([z.literal(""), z.enum(["cdi", "cdd", "freelance", "interim", "alternance", "stage", "other"])])
      .transform((v) => v || null),
    channel: z
      .union([z.literal(""), z.enum(Object.keys(CHANNELS) as [Channel, ...Channel[]])])
      .transform((v) => v || null),
    status: z.enum(APPLICATION_STATUSES),
    applied_at: isoDate,
    next_action: optional(500),
    next_action_at: isoDateTime,
    notes: optional(20000),
  })
  .superRefine((d, ctx) => {
    const notSentYet: ApplicationStatus[] = ["to_analyze", "to_prepare", "ready_to_send", "withdrawn"];
    if (d.applied_at && d.applied_at > new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["applied_at"], message: "La date d'envoi ne peut pas être dans le futur." });
    }
    if (!notSentYet.includes(d.status) && !d.applied_at) {
      // La base l'exige : on renseigne aujourd'hui plutôt que de bloquer l'utilisateur.
      d.applied_at = new Date().toISOString().slice(0, 10);
    }
    if (d.next_action_at && !d.next_action) {
      ctx.addIssue({ code: "custom", path: ["next_action"], message: "Décrivez l'action prévue à cette date." });
    }
  });
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

export const reminderFormSchema = z.object({
  title: z.string().trim().min(2, { error: "Décrivez le rappel." }).max(300),
  due_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, { error: "Choisissez une date." })
    .transform((v) => (v.length === 10 ? `${v}T09:00` : v)),
});

export const noteFormSchema = z.object({
  text: z.string().trim().min(1, { error: "La note est vide." }).max(2000, { error: "2 000 caractères maximum." }),
});

// --- Filtres de la liste --------------------------------------------------------

export const SORTS = {
  recent: "Ajoutées récemment",
  next_action: "Prochaine action",
  applied: "Date d'envoi",
  company: "Entreprise (A-Z)",
  coverage: "Couverture",
} as const;
export type Sort = keyof typeof SORTS;

export interface ListFilters {
  view: "table" | "kanban";
  q: string;
  statuses: ApplicationStatus[];
  channel: Channel | null;
  sort: Sort;
  archived: boolean;
}

/** Lit les paramètres d'URL de façon tolérante : toute valeur inconnue est ignorée. */
export function parseListFilters(sp: Record<string, string | string[] | undefined>): ListFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const statuses = one("statut")
    .split(",")
    .filter((s): s is ApplicationStatus => (APPLICATION_STATUSES as readonly string[]).includes(s));
  const channel = one("canal");
  const sort = one("tri");
  return {
    view: one("vue") === "kanban" ? "kanban" : "table",
    q: one("q").trim().slice(0, 100),
    statuses,
    channel: channel in CHANNELS ? (channel as Channel) : null,
    sort: sort in SORTS ? (sort as Sort) : "recent",
    archived: one("archives") === "1",
  };
}

/** Reconstruit une URL de liste en ne conservant que les paramètres utiles. */
export function listHref(f: Partial<ListFilters>, base: ListFilters): string {
  const m = { ...base, ...f };
  const p = new URLSearchParams();
  if (m.view === "kanban") p.set("vue", "kanban");
  if (m.q) p.set("q", m.q);
  if (m.statuses.length) p.set("statut", m.statuses.join(","));
  if (m.channel) p.set("canal", m.channel);
  if (m.sort !== "recent") p.set("tri", m.sort);
  if (m.archived) p.set("archives", "1");
  const s = p.toString();
  return s ? `/candidatures?${s}` : "/candidatures";
}

/** Retire les caractères qui ont un sens dans la syntaxe de filtre de l'API (virgules, parenthèses, jokers). */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
