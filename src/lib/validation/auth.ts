import { z } from "zod";

export const LEGAL_VERSIONS = { terms: "2026-11-11", privacy: "2026-11-11" } as const;

const email = z
  .string({ error: "Indiquez votre adresse email." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Cette adresse email n'est pas valide." }).max(254));

export const passwordSchema = z
  .string({ error: "Choisissez un mot de passe." })
  .min(10, { error: "Au moins 10 caractères." })
  .max(128, { error: "128 caractères maximum." })
  .regex(/[A-Za-zÀ-ÿ]/, { error: "Ajoutez au moins une lettre." })
  .regex(/[0-9]/, { error: "Ajoutez au moins un chiffre." });

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `Indiquez votre ${label}.` })
    .max(100, { error: "100 caractères maximum." })
    .regex(/^[\p{L}\p{M}' .-]+$/u, { error: "Utilisez uniquement des lettres, espaces, apostrophes ou tirets." });

export const signUpSchema = z.object({
  firstName: name("prénom"),
  lastName: name("nom"),
  email,
  password: passwordSchema,
  acceptTerms: z.literal("on", { error: "Acceptez les conditions pour créer votre compte." }),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Indiquez votre mot de passe." }).max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    error: "Les deux mots de passe ne correspondent pas.",
  });

export type FieldErrors = Partial<Record<string, string>>;

export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Valeurs non sensibles à réafficher (jamais le mot de passe). */
  values?: Record<string, string>;
}

export function firstErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
