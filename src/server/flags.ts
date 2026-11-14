import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getLlmProvider, type LlmProvider } from "@/server/ai/provider";
import { allow, RATE_RULES } from "@/server/rate-limit";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FeatureFlag = "ai_generation" | "contact_import" | "team_page_extraction" | "interview_coach" | "checkout";

export async function isEnabled(supabase: Supabase, key: FeatureFlag): Promise<boolean> {
  const { data, error } = await supabase.rpc("feature_enabled", { p_key: key });
  return !error && data === true;
}

/**
 * Fournisseur IA si une clé est configurée, la fonctionnalité activée par l'administration
 * et l'utilisateur sous la limite de débit. Sinon null : les moteurs déterministes prennent le relais.
 */
export async function aiProvider(supabase: Supabase, userId: string): Promise<LlmProvider | null> {
  const provider = getLlmProvider();
  if (!provider) return null;
  if (!(await isEnabled(supabase, "ai_generation"))) return null;
  return (await allow(RATE_RULES.aiUser, userId)) ? provider : null;
}
