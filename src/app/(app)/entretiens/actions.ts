"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";
import { hasInterviewCoach } from "@/server/interview/access";

const schema = z.object({
  applicationId: z.uuid(),
  questionId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  situation: z.string().max(2000),
  task: z.string().max(2000),
  action: z.string().max(3000),
  result: z.string().max(2000),
});

export async function saveStarAnswer(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(["applicationId", "questionId", "situation", "task", "action", "result"].map((k) => [k, String(fd.get(k) ?? "")])));
  if (!parsed.success) return { status: "error", message: "Réponse trop longue ou invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Session expirée." };
  if (!(await hasInterviewCoach(supabase))) return { status: "error", message: "Le coach d'entretien est inclus dans le forfait Premium." };

  const { applicationId, questionId, ...answer } = parsed.data;
  const { data: session } = await supabase.from("interview_sessions").select("id, prep").eq("application_id", applicationId).eq("mode", "text").maybeSingle();
  const prep = (session?.prep as { answers?: Record<string, unknown> } | null) ?? {};
  const answers = { ...(prep.answers ?? {}), [questionId]: { ...answer, updated_at: new Date().toISOString() } };
  const { error } = session
    ? await supabase.from("interview_sessions").update({ prep: { ...prep, answers } }).eq("id", session.id)
    : await supabase.from("interview_sessions").insert({ user_id: user.id, application_id: applicationId, mode: "text", prep: { answers } });
  if (error) return { status: "error", message: "L'enregistrement a échoué." };
  revalidatePath(`/entretiens/${applicationId}`);
  return { status: "success", message: "Réponse enregistrée." };
}
