import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getLlmProvider, type LlmProvider } from "@/server/ai/provider";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FeatureFlag = "ai_generation" | "contact_import" | "team_page_extraction" | "interview_coach" | "checkout";

export async function isEnabled(supabase: Supabase, key: FeatureFlag): Promise<boolean> {
  const { data, error } = await supabase.rpc("feature_enabled", { p_key: key });
  return !error && data === true;
}

/** Fournisseur IA si une clé est configurée ET la fonctionnalité activée par l'administration. */
export async function aiProvider(supabase: Supabase): Promise<LlmProvider | null> {
  const provider = getLlmProvider();
  if (!provider) return null;
  return (await isEnabled(supabase, "ai_generation")) ? provider : null;
}
