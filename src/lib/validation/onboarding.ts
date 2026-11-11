import { z } from "zod";

export const EXPERIENCE_LEVELS = {
  student: "Étudiant ou jeune diplômé",
  junior: "Moins de 3 ans d'expérience",
  confirmed: "3 à 7 ans",
  senior: "Plus de 7 ans",
  executive: "Direction / cadre dirigeant",
} as const;

export const MOBILITY = {
  local: "Ma ville et ses environs",
  regional: "Ma région",
  national: "Toute la France",
  international: "France et international",
  remote_only: "Télétravail uniquement",
} as const;

export const CONTRACT_TYPES = {
  cdi: "CDI",
  cdd: "CDD",
  freelance: "Freelance",
  interim: "Intérim",
  alternance: "Alternance",
  stage: "Stage",
} as const;

export const ONBOARDING_STEPS = [
  { step: 1, title: "Vous", optional: false },
  { step: 2, title: "Votre métier", optional: false },
  { step: 3, title: "Où et comment", optional: true },
  { step: 4, title: "Préférences", optional: true },
  { step: 5, title: "Votre CV", optional: true },
] as const;

const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `Indiquez votre ${label}.` })
    .max(100, { error: "100 caractères maximum." })
    .regex(/^[\p{L}\p{M}' .-]+$/u, { error: "Utilisez uniquement des lettres, espaces, apostrophes ou tirets." });

const optionalInt = (min: number, max: number, label: string) =>
  z.string().transform((raw, ctx) => {
    const v = raw.replace(/[\s\u00A0\u202F]/g, "");
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: `${label} : saisissez un nombre entier.` });
      return z.NEVER;
    }
    if (n < min || n > max) {
      ctx.addIssue({ code: "custom", message: `${label} : entre ${min} et ${max.toLocaleString("fr-FR")}.` });
      return z.NEVER;
    }
    return n;
  });

export const stepIdentitySchema = z.object({
  first_name: personName("prénom"),
  last_name: personName("nom"),
});

export const stepJobSchema = z.object({
  target_job: z.string().trim().min(2, { error: "Indiquez le métier que vous recherchez." }).max(200),
  experience_level: z.enum(Object.keys(EXPERIENCE_LEVELS) as [keyof typeof EXPERIENCE_LEVELS], {
    error: "Choisissez votre niveau d'expérience.",
  }),
  experience_years: optionalInt(0, 60, "Années d'expérience"),
});

export const stepLocationSchema = z.object({
  location: z.string().trim().max(200).transform((v) => v || null),
  mobility: z
    .union([z.literal(""), z.enum(Object.keys(MOBILITY) as [keyof typeof MOBILITY])])
    .transform((v) => v || null),
  contract_types: z.array(z.enum(Object.keys(CONTRACT_TYPES) as [keyof typeof CONTRACT_TYPES])).max(6),
});

export const stepPreferencesSchema = z
  .object({
    sectors: z
      .string()
      .max(500)
      .transform((v) =>
        Array.from(new Set(v.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 80))).slice(0, 10),
      ),
    desired_salary_min: optionalInt(0, 1_000_000, "Salaire minimum"),
    desired_salary_max: optionalInt(0, 1_000_000, "Salaire maximum"),
    available_from: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: "Date invalide." })
      .transform((v) => v || null),
  })
  .refine((d) => d.desired_salary_min == null || d.desired_salary_max == null || d.desired_salary_max >= d.desired_salary_min, {
    path: ["desired_salary_max"],
    error: "Le maximum doit être supérieur ou égal au minimum.",
  });

export const STEP_SCHEMAS = {
  1: stepIdentitySchema,
  2: stepJobSchema,
  3: stepLocationSchema,
  4: stepPreferencesSchema,
} as const;

/** Lit un formulaire en conservant les champs multiples (cases à cocher). */
export function formToObject(formData: FormData, multi: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$")) continue; // champs internes de React
    out[key] = multi.includes(key) ? formData.getAll(key).map(String) : String(formData.get(key) ?? "");
  }
  for (const key of multi) out[key] ??= [];
  return out;
}
