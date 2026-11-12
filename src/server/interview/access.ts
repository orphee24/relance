import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isEnabled } from "@/server/flags";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Coach d'entretien : forfait incluant `interview_coach` et fonctionnalité activée. */
export async function hasInterviewCoach(supabase: Supabase): Promise<boolean> {
  const [{ data }, enabled] = await Promise.all([supabase.rpc("my_entitlement"), isEnabled(supabase, "interview_coach")]);
  return enabled && (data as { quotas?: { interview_coach?: boolean } } | null)?.quotas?.interview_coach === true;
}
