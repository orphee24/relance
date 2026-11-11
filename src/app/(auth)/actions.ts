"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGoogleAuthEnabled, publicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/utils";
import {
  firstErrors,
  forgotPasswordSchema,
  type FormState,
  LEGAL_VERSIONS,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

// L'URL publique configurée fait foi ; l'en-tête Host n'est jamais utilisé pour les liens d'email.
async function siteUrl() {
  return publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

const GENERIC_ERROR = "Le service est momentanément indisponible. Réessayez dans quelques minutes.";

function mapAuthError(code: string | undefined, status: number | undefined): string {
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  }
  switch (code) {
    case "invalid_credentials":
      return "Email ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Confirmez d'abord votre adresse email : le lien vous a été envoyé à l'inscription.";
    case "weak_password":
      return "Ce mot de passe est trop faible ou figure dans une liste de mots de passe compromis.";
    case "same_password":
      return "Choisissez un mot de passe différent de l'actuel.";
    case "signup_disabled":
      return "Les inscriptions sont temporairement fermées.";
    default:
      return GENERIC_ERROR;
  }
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { firstName: raw.firstName ?? "", lastName: raw.lastName ?? "", email: raw.email ?? "" };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values };

  const { firstName, lastName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding`,
      data: {
        first_name: firstName,
        last_name: lastName,
        terms_version: LEGAL_VERSIONS.terms,
        privacy_version: LEGAL_VERSIONS.privacy,
      },
    },
  });

  if (error) return { status: "error", message: mapAuthError(error.code, error.status), values };

  // Confirmation d'email désactivée côté projet : session immédiate.
  if (data.session) redirect("/onboarding");

  // Réponse identique que l'adresse existe ou non (anti-énumération).
  redirect(`/verifier-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { email: raw.email ?? "" };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: "error", message: mapAuthError(error.code, error.status), values };

  redirect(safeRedirectPath(raw.next));
}

export async function signInWithGoogle(formData: FormData) {
  if (!isGoogleAuthEnabled()) redirect("/connexion");
  const next = safeRedirectPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/connexion?erreur=oauth");
  redirect(data.url);
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values: { email: raw.email ?? "" } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reinitialiser-mot-de-passe`,
  });
  if (error?.status === 429) return { status: "error", message: mapAuthError(error.code, 429) };

  // Message identique que le compte existe ou non.
  return {
    status: "success",
    message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable une heure.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error) };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { status: "error", message: "Ce lien a expiré. Demandez un nouveau lien de réinitialisation." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: mapAuthError(error.code, error.status) };

  redirect("/tableau-de-bord?mot-de-passe=modifie");
}

export async function resendVerification(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding` },
  });
  if (error?.status === 429) return { status: "error", message: mapAuthError(error.code, 429) };
  return { status: "success", message: "Si une inscription est en attente pour cette adresse, un nouveau lien a été envoyé." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
