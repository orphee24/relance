"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/config/domain";
import { applicationDedupeKey } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/server";
import { applicationFormSchema, noteFormSchema, reminderFormSchema } from "@/lib/validation/application";
import { firstErrors, type FormState } from "@/lib/validation/auth";

const uuid = z.uuid();
const LIMIT_MESSAGE =
  "Vous suivez déjà le nombre maximal de candidatures de votre forfait. Archivez une candidature terminée pour en ajouter une nouvelle.";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/candidatures");
  return { supabase, user };
}

const isLimitError = (e: { message?: string } | null) => e?.message?.includes("tracked_applications_limit") ?? false;

function readForm(fd: FormData) {
  const keys = ["company_name", "job_title", "offer_url", "location", "salary_text", "contract_type", "channel", "status", "applied_at", "next_action", "next_action_at", "notes"];
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
}

/** Convertit une date locale saisie (« 2026-11-14T09:00 ») en instant, dans le fuseau de l'utilisateur. */
function localToIso(value: string | null, tzOffsetMinutes: number): string | null {
  if (!value) return null;
  const [d, t = "09:00"] = value.split("T");
  const utc = Date.parse(`${d}T${t}:00Z`);
  return Number.isNaN(utc) ? null : new Date(utc + tzOffsetMinutes * 60_000).toISOString();
}
const tzOffset = (fd: FormData) => {
  const n = Number(fd.get("tz"));
  return Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? n : 0;
};

export interface CreateState extends FormState {
  duplicate?: { id: string; label: string; archived: boolean };
}

export async function createApplication(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const raw = readForm(fd);
  const parsed = applicationFormSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values: raw };
  const data = parsed.data;
  const { supabase, user } = await requireUser();

  if (fd.get("confirm_duplicate") !== "1") {
    const { data: dup } = await supabase
      .from("applications")
      .select("id, company_name, job_title, archived_at")
      .eq("dedupe_key", applicationDedupeKey(data.company_name, data.job_title))
      .limit(1)
      .maybeSingle();
    if (dup) {
      return {
        status: "error",
        values: raw,
        duplicate: { id: dup.id, label: `${dup.job_title} — ${dup.company_name}`, archived: Boolean(dup.archived_at) },
      };
    }
  }

  const { data: companyId } = await supabase.rpc("resolve_company", { p_name: data.company_name, p_domain: null });
  const { data: inserted, error } = await supabase
    .from("applications")
    .insert({
      ...data,
      user_id: user.id,
      company_id: typeof companyId === "string" ? companyId : null,
      next_action_at: localToIso(data.next_action_at, tzOffset(fd)),
    })
    .select("id")
    .single();
  if (isLimitError(error)) return { status: "error", message: LIMIT_MESSAGE, values: raw };
  if (error || !inserted) return { status: "error", message: "La candidature n'a pas pu être enregistrée. Réessayez.", values: raw };

  revalidatePath("/candidatures");
  revalidatePath("/tableau-de-bord");
  redirect(`/candidatures/${inserted.id}?creee=1`);
}

export async function updateApplication(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { status: "error", message: "Candidature introuvable." };
  const raw = readForm(fd);
  const parsed = applicationFormSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values: raw };
  const { status, ...rest } = parsed.data;
  const { supabase } = await requireUser();

  // Le statut passe par la fonction dédiée pour l'historique et la date d'envoi.
  const { error: statusError } = await supabase.rpc("set_application_status", { p_application_id: id.data, p_status: status, p_note: null });
  if (statusError) return { status: "error", message: "Le statut n'a pas pu être modifié.", values: raw };

  const { error } = await supabase
    .from("applications")
    .update({ ...rest, applied_at: rest.applied_at ?? undefined, next_action_at: localToIso(rest.next_action_at, tzOffset(fd)) })
    .eq("id", id.data);
  if (error) return { status: "error", message: "L'enregistrement a échoué. Réessayez.", values: raw };

  revalidatePath(`/candidatures/${id.data}`);
  revalidatePath("/candidatures");
  return { status: "success", message: "Modifications enregistrées." };
}

export interface MoveResult {
  ok: boolean;
  message?: string;
}

/** Déplacement de statut (Kanban, sélecteur de statut). */
export async function moveApplication(applicationId: string, status: string, note?: string): Promise<MoveResult> {
  if (!uuid.safeParse(applicationId).success || !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "Demande invalide." };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_application_status", {
    p_application_id: applicationId,
    p_status: status as ApplicationStatus,
    p_note: note?.slice(0, 2000) ?? null,
  });
  if (error) return { ok: false, message: error.code === "P0002" ? "Cette candidature n'existe plus." : "Le statut n'a pas pu être modifié." };
  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  revalidatePath("/tableau-de-bord");
  return { ok: true };
}

export async function addNote(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get("id"));
  const parsed = noteFormSchema.safeParse({ text: fd.get("text") ?? "" });
  if (!id.success) return { status: "error", message: "Candidature introuvable." };
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error) };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("application_events")
    .insert({ user_id: user.id, application_id: id.data, type: "note", payload: { text: parsed.data.text } });
  if (error) return { status: "error", message: "La note n'a pas pu être enregistrée." };
  revalidatePath(`/candidatures/${id.data}`);
  return { status: "success" };
}

export async function addReminder(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get("id"));
  const parsed = reminderFormSchema.safeParse({ title: fd.get("title") ?? "", due_at: fd.get("due_at") ?? "" });
  if (!id.success) return { status: "error", message: "Candidature introuvable." };
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error) };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("reminders").insert({
    user_id: user.id,
    application_id: id.data,
    title: parsed.data.title,
    due_at: localToIso(parsed.data.due_at, tzOffset(fd)),
  });
  if (error) return { status: "error", message: "Le rappel n'a pas pu être enregistré." };
  revalidatePath(`/candidatures/${id.data}`);
  revalidatePath("/tableau-de-bord");
  return { status: "success" };
}

export async function completeReminder(fd: FormData) {
  const id = uuid.safeParse(fd.get("reminderId"));
  const appId = uuid.safeParse(fd.get("id"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const done = fd.get("undo") === "1" ? null : new Date().toISOString();
  await supabase.from("reminders").update({ completed_at: done }).eq("id", id.data);
  if (appId.success) revalidatePath(`/candidatures/${appId.data}`);
  revalidatePath("/tableau-de-bord");
}

export async function setArchived(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) redirect("/candidatures");
  const archive = fd.get("archive") === "1";
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("applications")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id.data);
  revalidatePath("/candidatures");
  revalidatePath("/tableau-de-bord");
  if (isLimitError(error)) redirect(`/candidatures/${id.data}?erreur=limite`);
  redirect(`/candidatures/${id.data}?${archive ? "archivee" : "restauree"}=1`);
}

export async function deleteApplication(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) redirect("/candidatures");
  const { supabase } = await requireUser();
  await supabase.from("applications").delete().eq("id", id.data);
  revalidatePath("/candidatures");
  revalidatePath("/tableau-de-bord");
  redirect("/candidatures?supprimee=1");
}

/** Crée une candidature à partir d'une offre analysée (ou ouvre celle qui existe déjà). */
export async function trackOffer(fd: FormData) {
  const offerId = uuid.safeParse(fd.get("offerId"));
  if (!offerId.success) redirect("/analyser");
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase.from("applications").select("id").eq("offer_id", offerId.data).limit(1).maybeSingle();
  if (existing) redirect(`/candidatures/${existing.id}`);

  const { data: offer } = await supabase
    .from("job_offers")
    .select("id, company_id, company_name, title, url, location, salary_text, contract_type, resume_version_id")
    .eq("id", offerId.data)
    .maybeSingle();
  if (!offer) redirect("/analyser");

  const { data: inserted, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      offer_id: offer.id,
      company_id: offer.company_id,
      company_name: offer.company_name,
      job_title: offer.title,
      offer_url: offer.url,
      location: offer.location,
      salary_text: offer.salary_text,
      contract_type: offer.contract_type,
      resume_version_id: offer.resume_version_id,
      status: "to_prepare",
    })
    .select("id")
    .single();
  if (isLimitError(error)) redirect(`/analyser/${offer.id}?erreur=limite`);
  if (error || !inserted) redirect(`/analyser/${offer.id}?erreur=suivi`);

  revalidatePath("/candidatures");
  revalidatePath("/tableau-de-bord");
  redirect(`/candidatures/${inserted.id}?creee=1`);
}
