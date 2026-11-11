import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCostMicros } from "./provider";

/** Journalise la consommation IA (sans aucun contenu). Best effort : n'interrompt jamais le parcours utilisateur. */
export async function logAiUsage(entry: {
  userId: string;
  feature: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  success: boolean;
}) {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.from("ai_usage").insert({
    user_id: entry.userId,
    feature: entry.feature,
    provider: entry.provider,
    model: entry.model,
    input_tokens: entry.usage.inputTokens,
    output_tokens: entry.usage.outputTokens,
    cost_micros: estimateCostMicros(entry.usage),
    success: entry.success,
  });
  if (error) console.error("[ai_usage] insert failed", error.code);
}
