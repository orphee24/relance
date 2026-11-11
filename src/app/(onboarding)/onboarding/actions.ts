"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { firstErrors, type FormState } from "@/lib/validation/auth";
import { formToObject, STEP_SCHEMAS } from "@/lib/validation/onboarding";

type Step = keyof typeof STEP_SCHEMAS;

export async function saveOnboardingStep(_prev: FormState, formData: FormData): Promise<FormState> {
  const step = Number(formData.get("step")) as Step;
  const schema = STEP_SCHEMAS[step];
  if (!schema) return { status: "error", message: "Étape inconnue." };

  const raw = formToObject(formData, ["contract_types"]);
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/onboarding");

  // « Passer » : on avance sans enregistrer (uniquement pour les étapes facultatives).
  if (formData.get("intent") === "skip" && step >= 3) {
    await advance(supabase, user.id, step);
    redirect(`/onboarding?etape=${step + 1}`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values };

  const { error } = await supabase.from("user_profiles").update(parsed.data).eq("id", user.id);
  if (error) return { status: "error", message: "L'enregistrement a échoué. Réessayez.", values };

  await advance(supabase, user.id, step);
  redirect(`/onboarding?etape=${step + 1}`);
}

async function advance(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, step: number) {
  const { data } = await supabase.from("user_profiles").select("onboarding_step").eq("id", userId).maybeSingle();
  if ((data?.onboarding_step ?? 0) < step) {
    await supabase.from("user_profiles").update({ onboarding_step: step }).eq("id", userId);
  }
}

export async function completeOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  await supabase
    .from("user_profiles")
    .update({ onboarding_step: 5, onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarding_completed_at", null);
  redirect("/tableau-de-bord?bienvenue=1");
}
