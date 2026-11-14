"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";
import { resumeProfileSchema, USER_EVIDENCE } from "@/lib/validation/resume-profile";
import { aiProvider } from "@/server/flags";
import { logAiUsage } from "@/server/ai/usage";
import { ExtractionError, extractResumeText, MAX_RESUME_BYTES } from "@/server/cv/extract-text";
import { parseResume } from "@/server/cv/parse-resume";
import { safeRedirectPath } from "@/lib/utils";

const MAX_UPLOADS_PER_DAY = 10;
const MAX_RESUMES = 20;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/cv");
  return { supabase, user };
}

export async function uploadResume(_prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file");
  const next = formData.get("next")?.toString();
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", fieldErrors: { file: "Choisissez un fichier PDF ou Word (.docx)." } };
  }
  if (file.size > MAX_RESUME_BYTES) return { status: "error", fieldErrors: { file: "Le fichier dépasse 5 Mo." } };

  const { supabase, user } = await requireUser();

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ count: recent }, { count: total }] = await Promise.all([
    supabase.from("resumes").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("resumes").select("id", { count: "exact", head: true }),
  ]);
  if ((recent ?? 0) >= MAX_UPLOADS_PER_DAY) {
    return { status: "error", message: "Vous avez importé de nombreux CV aujourd'hui. Réessayez demain." };
  }
  if ((total ?? 0) >= MAX_RESUMES) {
    return { status: "error", message: `Vous avez atteint ${MAX_RESUMES} CV. Supprimez-en un pour en importer un nouveau.` };
  }

  let extracted;
  try {
    extracted = await extractResumeText(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof ExtractionError) return { status: "error", fieldErrors: { file: e.message } };
    throw e;
  }

  const outcome = await parseResume(extracted.text, await aiProvider(supabase, user.id));
  if (outcome.ai) {
    await logAiUsage({ userId: user.id, feature: "resume_parse", ...outcome.ai });
  }

  const id = randomUUID();
  const storagePath = `${user.id}/${id}.${extracted.kind}`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, file, { contentType: extracted.mimeType, upsert: false });
  if (uploadError) return { status: "error", message: "L'envoi du fichier a échoué. Réessayez." };

  const { count: primaryCount } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("is_primary", true);

  const title = file.name.replace(/\.(pdf|docx)$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 200) || "Mon CV";
  const { error: insertError } = await supabase.from("resumes").insert({
    id,
    user_id: user.id,
    title,
    storage_path: storagePath,
    original_filename: file.name.slice(0, 255),
    mime_type: extracted.mimeType,
    size_bytes: file.size,
    extracted_text: extracted.text,
    parsed_profile: outcome.parse,
    is_primary: (primaryCount ?? 0) === 0,
  });
  if (insertError) {
    await supabase.storage.from("resumes").remove([storagePath]);
    return { status: "error", message: "Le CV n'a pas pu être enregistré. Réessayez." };
  }

  revalidatePath("/cv");
  const suffix = next ? `?suite=${encodeURIComponent(safeRedirectPath(next))}` : "";
  redirect(`/cv/${id}/verifier${suffix}`);
}

export async function verifyResume(_prev: FormState, formData: FormData): Promise<FormState> {
  const resumeId = String(formData.get("resumeId") ?? "");
  const label = String(formData.get("label") ?? "").slice(0, 200);
  const next = formData.get("next")?.toString();

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("profile") ?? ""));
  } catch {
    return { status: "error", message: "Le formulaire est incomplet. Rechargez la page." };
  }
  const parsed = resumeProfileSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      message: `Une information est invalide (${issue?.path.join(" › ") ?? "profil"}) : vérifiez les champs obligatoires et les longueurs.`,
    };
  }
  const profile = parsed.data;

  const { supabase } = await requireUser();
  const skills = profile.skills.map((s) => ({
    name: s.name,
    category: s.category,
    evidence: s.evidence,
    source: s.evidence === USER_EVIDENCE ? "user" : "resume",
  }));

  const { data: version, error } = await supabase.rpc("save_verified_resume", {
    p_resume_id: resumeId,
    p_content: profile,
    p_skills: skills,
    p_label: label || null,
  });
  if (error) {
    return { status: "error", message: error.code === "P0002" ? "Ce CV n'existe plus." : "L'enregistrement a échoué. Réessayez." };
  }

  revalidatePath("/cv");
  if (next) redirect(safeRedirectPath(next));
  redirect(`/cv/${resumeId}?version=${version}`);
}

export async function setPrimaryResume(formData: FormData) {
  const { supabase } = await requireUser();
  await supabase.rpc("set_primary_resume", { p_resume_id: String(formData.get("resumeId") ?? "") });
  revalidatePath("/cv");
}

export async function deleteResume(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("resumeId") ?? "");
  const { data: resume } = await supabase.from("resumes").select("id, storage_path").eq("id", id).maybeSingle();
  if (!resume) redirect("/cv");

  const { error } = await supabase.from("resumes").delete().eq("id", id);
  if (!error && resume.storage_path) {
    await supabase.storage.from("resumes").remove([resume.storage_path]);
  }
  revalidatePath("/cv");
  redirect("/cv?supprime=1");
}
