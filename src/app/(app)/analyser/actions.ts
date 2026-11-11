"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { firstErrors, type FormState } from "@/lib/validation/auth";
import { analyzeOfferFormSchema, storedAnalysisSchema, type StoredAnalysis } from "@/lib/validation/offer";
import { resumeProfileSchema } from "@/lib/validation/resume-profile";
import { getLlmProvider } from "@/server/ai/provider";
import { logAiUsage } from "@/server/ai/usage";
import { analyzeOffer, type AiCall } from "@/server/offers/analyze";
import { companyDomainFromOfferUrl } from "@/server/offers/company";
import { applySuggestions } from "@/server/offers/suggestions";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/analyser");
  return { supabase, user };
}

async function loadVersion(supabase: Supabase, versionId: string | null) {
  let query = supabase
    .from("resume_versions")
    .select("id, label, version_no, content, resume_id, resumes!inner(id, title, is_primary)")
    .order("version_no", { ascending: false })
    .limit(1);
  query = versionId ? query.eq("id", versionId) : query.eq("resumes.is_primary", true);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const parsed = resumeProfileSchema.safeParse(data.content);
  if (!parsed.success) return null;
  const resume = Array.isArray(data.resumes) ? data.resumes[0] : data.resumes;
  return { versionId: data.id, resumeId: data.resume_id, label: `${resume?.title ?? "CV"} — ${data.label ?? `version ${data.version_no}`}`, profile: parsed.data };
}

async function logCalls(userId: string, calls: AiCall[]) {
  await Promise.all(calls.map((c) => logAiUsage({ userId, ...c })));
}

export async function analyzeOfferAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(
    ["description", "title", "company", "location", "url", "resumeVersionId"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const values = { ...raw, description: raw.description ?? "" };
  const parsed = analyzeOfferFormSchema
    .extend({ company: z.string().trim().min(1, { error: "Indiquez le nom de l'entreprise." }).max(200) })
    .safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values };
  const form = parsed.data;

  const { supabase, user } = await requireUser();
  const resume = await loadVersion(supabase, form.resumeVersionId);

  const { data: quotaEvent, error: quotaError } = await supabase.rpc("consume_quota", { p_feature: "offer_analysis" });
  if (quotaError) return { status: "error", message: "Le service est momentanément indisponible. Réessayez.", values };
  if (!quotaEvent) {
    return {
      status: "error",
      message: "Vous avez utilisé toutes les analyses de votre forfait pour cette période. Elles seront de nouveau disponibles à la fin de la période, ou avec un forfait supérieur.",
      values,
    };
  }

  let offerId: string | null = null;
  try {
    const { analysis, aiCalls } = await analyzeOffer({
      offerText: form.description,
      overrides: { title: form.title, company: form.company, location: form.location },
      resume: resume ? { versionId: resume.versionId, label: resume.label, profile: resume.profile } : null,
      provider: getLlmProvider(),
    });
    await logCalls(user.id, aiCalls);

    const domain = companyDomainFromOfferUrl(form.url);
    const { data: companyId } = await supabase.rpc("resolve_company", { p_name: form.company, p_domain: domain });

    const { data: inserted, error } = await supabase
      .from("job_offers")
      .insert({
        user_id: user.id,
        company_id: typeof companyId === "string" ? companyId : null,
        company_name: form.company,
        title: (analysis.metadata.title ?? "Offre sans titre").slice(0, 300),
        description: form.description,
        url: form.url,
        location: analysis.metadata.location,
        department: analysis.metadata.department,
        salary_text: analysis.metadata.salaryText,
        contract_type: analysis.metadata.contractType,
        extracted: analysis,
        coverage_score: analysis.score,
        analyzed_at: analysis.analyzedAt,
        resume_version_id: resume?.versionId ?? null,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("insert job_offers failed");
    offerId = inserted.id;
    await saveRequirements(supabase, user.id, inserted.id, analysis);
  } catch {
    if (offerId) await supabase.from("job_offers").delete().eq("id", offerId);
    await supabase.rpc("refund_quota", { p_event_id: quotaEvent });
    return { status: "error", message: "L'analyse n'a pas pu être enregistrée. Votre quota n'a pas été décompté. Réessayez.", values };
  }

  revalidatePath("/analyser");
  redirect(`/analyser/${offerId}`);
}

async function saveRequirements(supabase: Supabase, userId: string, offerId: string, analysis: StoredAnalysis) {
  await supabase.from("job_requirements").delete().eq("offer_id", offerId);
  if (analysis.requirements.length === 0) return;
  const { error } = await supabase.from("job_requirements").insert(
    analysis.requirements.map((r, i) => ({
      user_id: userId,
      offer_id: offerId,
      kind: r.kind,
      category: r.category,
      label: r.label.slice(0, 300),
      offer_evidence: r.offerEvidence.slice(0, 1000),
      coverage: r.coverage,
      resume_evidence: r.resumeEvidence?.slice(0, 1000) ?? null,
      position: i,
    })),
  );
  if (error) throw new Error("insert job_requirements failed");
}

async function loadAnalysis(supabase: Supabase, offerId: string) {
  const { data } = await supabase.from("job_offers").select("id, company_name, description, extracted, resume_version_id").eq("id", offerId).maybeSingle();
  if (!data) return null;
  const parsed = storedAnalysisSchema.safeParse(data.extracted);
  return parsed.success ? { offer: data, analysis: parsed.data } : null;
}

const suggestionDecisionSchema = z.object({
  offerId: z.uuid(),
  suggestionId: z.string().min(1).max(64),
  decision: z.enum(["accept", "refuse", "reset"]),
  skillName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function decideSuggestion(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = suggestionDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Demande invalide." };
  const { offerId, suggestionId, decision, skillName, note } = parsed.data;

  const { supabase } = await requireUser();
  const loaded = await loadAnalysis(supabase, offerId);
  if (!loaded) return { status: "error", message: "Analyse introuvable." };

  const suggestion = loaded.analysis.suggestions.find((s) => s.id === suggestionId);
  if (!suggestion) return { status: "error", message: "Suggestion introuvable." };

  if (decision === "accept" && suggestion.type === "declare_if_true") {
    const errors: Record<string, string> = {};
    if (!skillName || skillName.length < 2) errors.skillName = "Indiquez la compétence telle que vous voulez la faire apparaître.";
    if (!note || note.length < 10) errors.note = "Précisez où vous l'avez pratiquée (au moins 10 caractères).";
    if (Object.keys(errors).length) return { status: "error", fieldErrors: errors };
  }
  if (suggestion.type === "information") return { status: "error", message: "Cette information ne se modifie pas." };

  const updated = loaded.analysis.suggestions.map((s) =>
    s.id !== suggestionId
      ? s
      : {
          ...s,
          status: decision === "accept" ? ("accepted" as const) : decision === "refuse" ? ("refused" as const) : ("pending" as const),
          skillName: s.type === "declare_if_true" ? (decision === "accept" ? skillName ?? null : null) : s.skillName,
          userNote: s.type === "declare_if_true" && decision === "accept" ? note ?? null : null,
        },
  );
  const { error } = await supabase
    .from("job_offers")
    .update({ extracted: { ...loaded.analysis, suggestions: updated } })
    .eq("id", offerId);
  if (error) return { status: "error", message: "L'enregistrement a échoué." };
  revalidatePath(`/analyser/${offerId}`);
  return { status: "success" };
}

export async function createAdaptedVersion(formData: FormData) {
  const offerId = String(formData.get("offerId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) redirect("/analyser");
  const { supabase, user } = await requireUser();
  const loaded = await loadAnalysis(supabase, offerId);
  if (!loaded?.analysis.resumeVersionId) redirect(`/analyser/${offerId}?erreur=cv`);

  const version = await loadVersion(supabase, loaded.analysis.resumeVersionId);
  if (!version) redirect(`/analyser/${offerId}?erreur=cv`);

  const { profile, applied } = applySuggestions(version.profile, loaded.analysis.suggestions);
  if (applied === 0) redirect(`/analyser/${offerId}`);

  const skills = profile.skills.map((s) => ({
    name: s.name,
    category: s.category,
    evidence: s.evidence,
    source: s.evidence.startsWith("Déclaré par vous") ? "user" : "resume",
  }));
  const { data: versionNo, error } = await supabase.rpc("save_verified_resume", {
    p_resume_id: version.resumeId,
    p_content: profile,
    p_skills: skills,
    p_label: `Adaptée — ${loaded.offer.company_name}`.slice(0, 200),
    p_source_offer_id: offerId,
  });
  if (error) redirect(`/analyser/${offerId}?erreur=version`);

  const { data: newVersion } = await supabase
    .from("resume_versions")
    .select("id")
    .eq("resume_id", version.resumeId)
    .eq("version_no", versionNo)
    .single();

  // Nouvelle analyse avec la version adaptée (non décomptée du quota).
  const { analysis, aiCalls } = await analyzeOffer({
    offerText: loaded.offer.description,
    overrides: { title: loaded.analysis.metadata.title, company: loaded.analysis.metadata.company, location: loaded.analysis.metadata.location },
    resume: { versionId: newVersion?.id ?? version.versionId, label: `${version.label.split(" — ")[0]} — Adaptée — ${loaded.offer.company_name}`, profile },
    provider: getLlmProvider(),
  });
  await logCalls(user.id, aiCalls);
  await supabase
    .from("job_offers")
    .update({ extracted: analysis, coverage_score: analysis.score, analyzed_at: analysis.analyzedAt, resume_version_id: newVersion?.id ?? null })
    .eq("id", offerId);
  await saveRequirements(supabase, user.id, offerId, analysis);

  revalidatePath(`/analyser/${offerId}`);
  revalidatePath("/cv");
  redirect(`/analyser/${offerId}?adaptee=${applied}&avant=${loaded.analysis.score ?? ""}`);
}

export async function deleteOffer(formData: FormData) {
  const offerId = String(formData.get("offerId") ?? "");
  const { supabase } = await requireUser();
  await supabase.from("job_offers").delete().eq("id", offerId);
  revalidatePath("/analyser");
  redirect("/analyser?supprimee=1");
}
