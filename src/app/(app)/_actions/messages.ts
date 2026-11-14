"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { aiProvider } from "@/server/flags";
import { logAiUsage } from "@/server/ai/usage";
import { checkMessage, hasBlockingIssue, type CheckIssue } from "@/server/messages/checks";
import { generateMessage } from "@/server/messages/generate";
import { loadMessageSetup } from "@/server/messages/load";
import { PURPOSES, RECIPIENT_TYPES, TONES } from "@/server/messages/templates";

const opt = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);
const optionalUuid = z.union([z.literal(""), z.uuid()]).transform((v) => v || null);

const requestSchema = z.object({
  networkId: optionalUuid,
  applicationId: optionalUuid,
  purpose: opt(Object.keys(PURPOSES) as (keyof typeof PURPOSES)[]),
  tone: opt(Object.keys(TONES) as (keyof typeof TONES)[]),
  format: z.enum(["note", "message", "email"]),
  recipientType: opt(Object.keys(RECIPIENT_TYPES) as (keyof typeof RECIPIENT_TYPES)[]),
  introTarget: z.string().trim().max(120).transform((v) => v || null),
});

export interface DraftState {
  status: "idle" | "ready" | "error";
  message?: string;
  draftId?: string;
  subject?: string | null;
  body?: string;
  issues?: CheckIssue[];
  source?: "template" | "ai";
  note?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
}

export async function generateDraft(_prev: DraftState, fd: FormData): Promise<DraftState> {
  const parsed = requestSchema.safeParse(Object.fromEntries(["networkId", "applicationId", "purpose", "tone", "format", "recipientType", "introTarget"].map((k) => [k, String(fd.get(k) ?? "")])));
  if (!parsed.success) return { status: "error", message: "Demande invalide." };
  const req = parsed.data;
  if (!req.networkId && !req.applicationId) return { status: "error", message: "Destinataire introuvable." };

  const { supabase, user } = await requireUser();
  const setup = await loadMessageSetup(supabase, { networkId: req.networkId, applicationId: req.applicationId, userId: user.id });
  if (!setup) return { status: "error", message: "Contact ou candidature introuvable." };
  if (setup.doNotContact) return { status: "error", message: "Cette personne est marquée « Ne plus contacter »." };
  if (req.purpose === "thank_you" && !setup.ctx.hadExchange) {
    return { status: "error", message: "Aucun échange n'est enregistré avec cette personne : un message de remerciement serait inexact. Enregistrez d'abord l'échange sur sa fiche." };
  }
  if (!setup.allowedRecipients.includes(req.recipientType)) {
    return { status: "error", message: req.recipientType === "alumni" ? "Aucune école commune n'est enregistrée pour cette personne." : "Aucune connexion commune n'est enregistrée pour cette personne." };
  }

  // L'IA est réservée au quota « relances IA » du forfait ; au-delà, le modèle sans IA est utilisé.
  let provider = await aiProvider(supabase, user.id);
  let note: string | undefined;
  let quotaEvent: string | null = null;
  if (provider) {
    const { data } = await supabase.rpc("consume_quota", { p_feature: "ai_follow_up" });
    quotaEvent = typeof data === "string" ? data : null;
    if (!quotaEvent) {
      provider = null;
      note = "Rédaction par IA épuisée pour votre forfait : message préparé à partir d'un modèle.";
    }
  }

  const ctx = { ...setup.ctx, format: req.format };
  const result = await generateMessage({
    facts: { ...setup.facts, recipientType: req.recipientType, introTarget: req.introTarget },
    purpose: req.purpose,
    tone: req.tone,
    format: req.format,
    ctx,
    provider,
  });
  if (result.aiCall) await logAiUsage({ userId: user.id, ...result.aiCall });
  if (quotaEvent && result.source !== "ai") await supabase.rpc("refund_quota", { p_event_id: quotaEvent });
  if (result.aiRejected) note = "La proposition de l'IA évoquait des éléments non enregistrés : elle a été écartée au profit du modèle.";

  const { data: draft, error } = await supabase
    .from("message_drafts")
    .insert({
      user_id: user.id,
      network_contact_id: setup.networkId,
      application_id: setup.applicationId,
      recipient_type: req.recipientType,
      tone: req.tone,
      purpose: req.purpose,
      subject: result.subject,
      body: result.body.slice(0, 5000),
      generated_by_ai: result.source === "ai",
    })
    .select("id")
    .single();
  if (error || !draft) return { status: "error", message: "Le brouillon n'a pas pu être enregistré." };

  return { status: "ready", draftId: draft.id, subject: result.subject, body: result.body, issues: result.issues, source: result.source, note };
}

const saveSchema = z.object({
  draftId: z.uuid(),
  body: z.string().max(5000),
  subject: z.string().max(300).optional(),
  format: z.enum(["note", "message", "email"]),
});

/** Enregistre la version finale (éventuellement modifiée) au moment de la copie, après contrôle. */
export async function saveCopiedDraft(input: { draftId: string; body: string; subject?: string; format: "note" | "message" | "email" }): Promise<{ ok: boolean; issues?: CheckIssue[] }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase, user } = await requireUser();
  const { data: draft } = await supabase.from("message_drafts").select("network_contact_id, application_id").eq("id", parsed.data.draftId).maybeSingle();
  if (!draft) return { ok: false };
  const setup = await loadMessageSetup(supabase, { networkId: draft.network_contact_id, applicationId: draft.application_id, userId: user.id });
  if (!setup) return { ok: false };
  const issues = checkMessage(parsed.data.body, { ...setup.ctx, format: parsed.data.format });
  if (hasBlockingIssue(issues)) return { ok: false, issues };
  await supabase
    .from("message_drafts")
    .update({ body: parsed.data.body.trim(), subject: parsed.data.subject?.trim() || null, copied_at: new Date().toISOString() })
    .eq("id", parsed.data.draftId);
  return { ok: true, issues };
}

export async function markDraftSent(fd: FormData): Promise<void> {
  const draftId = z.uuid().safeParse(fd.get("draftId"));
  if (!draftId.success) return;
  const channel = z.enum(["linkedin", "email", "phone", "in_person", "other"]).safeParse(fd.get("channel"));
  const { supabase } = await requireUser();
  const { data: draft } = await supabase.from("message_drafts").select("network_contact_id, application_id, purpose").eq("id", draftId.data).maybeSingle();
  if (!draft) return;
  if (draft.purpose === "application_follow_up") {
    const { error } = await supabase.rpc("record_application_follow_up", { p_application_id: draft.application_id, p_draft_id: draftId.data });
    if (error?.message?.includes("follow_up_limit")) redirect(`/candidatures/${draft.application_id}/relance?erreur=limite`);
    revalidatePath(`/candidatures/${draft.application_id}`);
    revalidatePath("/candidatures");
    redirect(`/candidatures/${draft.application_id}?relance=envoyee`);
  }
  if (draft.network_contact_id) {
    await supabase.rpc("record_contact_message_sent", { p_draft_id: draftId.data, p_channel: channel.success ? channel.data : null });
    revalidatePath(`/reseau/${draft.network_contact_id}`);
    revalidatePath("/reseau");
    redirect(`/reseau/${draft.network_contact_id}?message=envoye`);
  }
}
