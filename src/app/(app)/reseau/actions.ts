"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { firstErrors, type FormState } from "@/lib/validation/auth";
import {
  contactFormSchema,
  IMPORT_CONSENT_VERSION,
  interactionFormSchema,
  NETWORK_STATUSES,
} from "@/lib/validation/network";
import { classifyRole, relevanceInputs, sameCompany, strategyForRole, type RoleType } from "@/server/network/engine";
import { applicationFacts } from "@/server/network/load";
import { isEnabled } from "@/server/flags";
import { computeRelevance } from "@/server/network/relevance";
import { extractPeopleFromText, parseContactsCsv, type PersonCandidate } from "@/server/network/sources";

const uuid = z.uuid();
type Supabase = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/reseau");
  return { supabase, user };
}

const DAILY_LIMIT = "Vous avez ajouté 50 personnes aujourd'hui. Pour éviter toute collecte massive, la limite est atteinte jusqu'à demain.";

function revalidateNetwork(applicationId?: string | null) {
  revalidatePath("/reseau");
  revalidatePath("/entreprises");
  if (applicationId) revalidatePath(`/candidatures/${applicationId}`);
}

/** Score et stratégie au moment du rattachement (instantané conservé avec la candidature). */
async function scoreFor(supabase: Supabase, applicationId: string, contact: { current_title: string | null; department: string | null; work_location: string | null; role_type: RoleType; has_mutual_connection: boolean; mutual_connection_note: string | null }) {
  const app = await applicationFacts(supabase, applicationId);
  if (!app) return null;
  const r = computeRelevance(relevanceInputs(contact, app.facts));
  return { relevance_score: r.score, score_breakdown: r, strategy: strategyForRole(contact.role_type) };
}

export async function addContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const keys = ["first_name", "last_name", "current_title", "company_name", "department", "work_location", "profile_url", "role", "provider", "source_url", "has_mutual_connection", "mutual_connection_note", "is_alumni", "verified", "notes", "application_id"];
  const raw = Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = contactFormSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error), values: raw };
  const d = parsed.data;
  const { supabase } = await requireUser();

  const app = d.application_id ? await applicationFacts(supabase, d.application_id) : null;
  const role_type: RoleType = d.role === "auto" ? classifyRole(d.current_title, app?.facts.job_title) : d.role;
  const facts = { current_title: d.current_title, department: d.department, work_location: d.work_location, role_type, has_mutual_connection: d.has_mutual_connection, mutual_connection_note: d.mutual_connection_note };
  const score = d.application_id ? await scoreFor(supabase, d.application_id, facts) : null;

  const { data: networkId, error } = await supabase.rpc("add_network_contact", {
    p: {
      ...d,
      role_type,
      company_domain: app && sameCompany(d.company_name, app.company) ? app.companyDomain : null,
      ...(score ?? {}),
    },
  });
  if (error?.message?.includes("contact_daily_limit")) return { status: "error", message: DAILY_LIMIT, values: raw };
  if (error || !networkId) return { status: "error", message: "La personne n'a pas pu être enregistrée. Réessayez.", values: raw };

  revalidateNetwork(d.application_id);
  redirect(d.application_id ? `/candidatures/${d.application_id}?contact=ajoute#personnes` : `/reseau/${networkId}?ajoute=1`);
}

export async function linkToApplication(fd: FormData) {
  const networkId = uuid.safeParse(fd.get("networkId"));
  const applicationId = uuid.safeParse(fd.get("applicationId"));
  if (!networkId.success || !applicationId.success) return;
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase
    .from("user_network_contacts")
    .select("has_mutual_connection, mutual_connection_note, status, professional_contacts(current_title, department, work_location, role_type)")
    .eq("id", networkId.data)
    .maybeSingle();
  if (!row || row.status === "do_not_contact") return;
  const pc = (Array.isArray(row.professional_contacts) ? row.professional_contacts[0] : row.professional_contacts) as {
    current_title: string | null; department: string | null; work_location: string | null; role_type: RoleType;
  } | null;
  if (!pc) return;
  const score = await scoreFor(supabase, applicationId.data, { ...pc, has_mutual_connection: row.has_mutual_connection, mutual_connection_note: row.mutual_connection_note });
  await supabase.from("application_contacts").upsert(
    { user_id: user.id, application_id: applicationId.data, network_contact_id: networkId.data, ...(score ?? {}) },
    { onConflict: "application_id,network_contact_id" },
  );
  revalidateNetwork(applicationId.data);
}

export async function unlinkFromApplication(fd: FormData) {
  const networkId = uuid.safeParse(fd.get("networkId"));
  const applicationId = uuid.safeParse(fd.get("applicationId"));
  if (!networkId.success || !applicationId.success) return;
  const { supabase } = await requireUser();
  await supabase.from("application_contacts").delete().eq("application_id", applicationId.data).eq("network_contact_id", networkId.data);
  revalidateNetwork(applicationId.data);
}

export async function setContactStatus(fd: FormData) {
  const networkId = uuid.safeParse(fd.get("networkId"));
  const status = z.enum(NETWORK_STATUSES).safeParse(fd.get("status"));
  if (!networkId.success || !status.success) return;
  const { supabase } = await requireUser();
  await supabase.from("user_network_contacts").update({ status: status.data }).eq("id", networkId.data);
  revalidateNetwork();
  revalidatePath(`/reseau/${networkId.data}`);
}

export async function logInteraction(_prev: FormState, fd: FormData): Promise<FormState> {
  const networkId = uuid.safeParse(fd.get("networkId"));
  const parsed = interactionFormSchema.safeParse({ type: fd.get("type") ?? "", channel: fd.get("channel") ?? "", summary: fd.get("summary") ?? "" });
  if (!networkId.success) return { status: "error", message: "Contact introuvable." };
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error) };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("log_network_interaction", {
    p_network_contact_id: networkId.data,
    p_type: parsed.data.type,
    p_channel: parsed.data.channel,
    p_summary: parsed.data.summary,
    p_application_id: null,
  });
  if (error?.message?.includes("do_not_contact")) return { status: "error", message: "Cette personne est marquée « Ne plus contacter »." };
  if (error) return { status: "error", message: "L'échange n'a pas pu être enregistré." };
  revalidatePath(`/reseau/${networkId.data}`);
  revalidatePath("/reseau");
  return { status: "success" };
}

export async function confirmEmployment(fd: FormData) {
  const networkId = uuid.safeParse(fd.get("networkId"));
  if (!networkId.success) return;
  const note = String(fd.get("note") ?? "").trim().slice(0, 500) || null;
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase.from("user_network_contacts").select("contact_id").eq("id", networkId.data).maybeSingle();
  if (!row) return;
  // RLS : seule une fiche dont l'utilisateur est propriétaire peut être modifiée.
  const { error } = await supabase
    .from("professional_contacts")
    .update({ employment_confidence: "verified", last_verified_at: new Date().toISOString() })
    .eq("id", row.contact_id);
  if (!error) {
    await supabase.from("contact_verifications").insert({ contact_id: row.contact_id, method: "user_confirmed", result: "verified", note, verified_by: user.id });
  }
  revalidatePath(`/reseau/${networkId.data}`);
  revalidateNetwork();
}

export async function updateContactNotes(_prev: FormState, fd: FormData): Promise<FormState> {
  const networkId = uuid.safeParse(fd.get("networkId"));
  if (!networkId.success) return { status: "error", message: "Contact introuvable." };
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 10000) || null;
  const mutual = fd.get("has_mutual_connection") === "on";
  const mutualNote = String(fd.get("mutual_connection_note") ?? "").trim().slice(0, 500) || null;
  if (mutual && !mutualNote) return { status: "error", fieldErrors: { mutual_connection_note: "Précisez la connexion commune." } };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("user_network_contacts")
    .update({ notes, has_mutual_connection: mutual, mutual_connection_note: mutual ? mutualNote : null })
    .eq("id", networkId.data);
  if (error) return { status: "error", message: "L'enregistrement a échoué." };
  revalidatePath(`/reseau/${networkId.data}`);
  revalidateNetwork();
  return { status: "success", message: "Enregistré." };
}

/** Supprime la fiche et ses sources (droit d'effacement pour les tiers). */
export async function deleteContact(fd: FormData) {
  const networkId = uuid.safeParse(fd.get("networkId"));
  if (!networkId.success) redirect("/reseau");
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from("user_network_contacts").select("contact_id").eq("id", networkId.data).maybeSingle();
  if (row) {
    const { error } = await supabase.from("professional_contacts").delete().eq("id", row.contact_id);
    if (error) await supabase.from("user_network_contacts").delete().eq("id", networkId.data);
  }
  revalidateNetwork();
  redirect("/reseau?supprime=1");
}

// --- Import CSV ------------------------------------------------------------------

export interface ImportState extends FormState {
  result?: { created: number; duplicates: number; skipped: number; ignoredEmailColumn: boolean };
}

export async function importContacts(_prev: ImportState, fd: FormData): Promise<ImportState> {
  if (fd.get("consent") !== "on") {
    return { status: "error", fieldErrors: { consent: "Confirmez que ces personnes font partie de vos relations et que l'import est pour votre usage personnel." } };
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", fieldErrors: { file: "Choisissez un fichier CSV." } };
  if (file.size > 2 * 1024 * 1024) return { status: "error", fieldErrors: { file: "Le fichier dépasse 2 Mo." } };

  const parsed = parseContactsCsv(await file.text());
  if (parsed.error) return { status: "error", fieldErrors: { file: parsed.error } };
  if (parsed.rows.length === 0) return { status: "error", fieldErrors: { file: "Aucun contact lisible dans ce fichier." } };

  const { supabase } = await requireUser();
  if (!(await isEnabled(supabase, "contact_import"))) return { status: "error", message: "L'import de contacts est momentanément désactivé." };
  const { data: quotaEvent, error: quotaError } = await supabase.rpc("consume_quota", { p_feature: "network_search" });
  if (quotaError) return { status: "error", message: "Le service est momentanément indisponible." };
  if (!quotaEvent) return { status: "error", message: "Vous avez utilisé toutes vos recherches réseau du jour. Réessayez demain." };

  const rows = parsed.rows.map((r) => ({ ...r, role_type: classifyRole(r.current_title) }));
  const { data, error } = await supabase.rpc("import_network_contacts", { p_rows: rows, p_consent_version: IMPORT_CONSENT_VERSION });
  if (error) {
    await supabase.rpc("refund_quota", { p_event_id: quotaEvent });
    return { status: "error", message: "L'import a échoué. Aucun contact n'a été ajouté." };
  }
  revalidateNetwork();
  const r = data as { created: number; duplicates: number };
  return { status: "success", result: { ...r, skipped: parsed.skipped, ignoredEmailColumn: parsed.ignoredEmailColumn } };
}

// --- Page « équipe » collée --------------------------------------------------------

export interface ExtractState extends FormState {
  candidates?: PersonCandidate[];
  sourceUrl?: string | null;
  companyName?: string;
  applicationId?: string | null;
}

export async function extractTeamPage(_prev: ExtractState, fd: FormData): Promise<ExtractState> {
  const text = String(fd.get("text") ?? "");
  const sourceUrl = String(fd.get("source_url") ?? "").trim();
  const companyName = String(fd.get("company_name") ?? "").trim().slice(0, 200);
  const applicationId = uuid.safeParse(fd.get("application_id")).data ?? null;
  const errors: Record<string, string> = {};
  if (text.trim().length < 20) errors.text = "Collez le texte de la page (noms et fonctions).";
  if (text.length > 50_000) errors.text = "Texte trop long (50 000 caractères maximum).";
  if (!/^https:\/\/\S+$/i.test(sourceUrl)) errors.source_url = "Indiquez l'adresse de la page officielle (https://…).";
  if (Object.keys(errors).length) return { status: "error", fieldErrors: errors, values: { text, source_url: sourceUrl } };
  const { supabase } = await requireUser();
  if (!(await isEnabled(supabase, "team_page_extraction"))) return { status: "error", message: "Cette fonctionnalité est momentanément désactivée.", values: { text, source_url: sourceUrl } };
  const candidates = extractPeopleFromText(text, 60);
  if (candidates.length === 0) {
    return { status: "error", message: "Aucun nom de personne n'a été reconnu dans ce texte.", values: { text, source_url: sourceUrl } };
  }
  return { status: "success", candidates, sourceUrl, companyName, applicationId };
}

export async function saveExtracted(_prev: FormState, fd: FormData): Promise<FormState> {
  const selected = fd.getAll("pick").map(String);
  const sourceUrl = String(fd.get("source_url") ?? "");
  const companyName = String(fd.get("company_name") ?? "").slice(0, 200) || null;
  const applicationId = uuid.safeParse(fd.get("application_id")).data ?? null;
  let candidates: PersonCandidate[];
  try {
    candidates = z
      .array(z.object({ firstName: z.string().max(100), lastName: z.string().max(100), title: z.string().max(300).nullable(), line: z.string().max(2000) }))
      .max(60)
      .parse(JSON.parse(String(fd.get("candidates") ?? "[]")));
  } catch {
    return { status: "error", message: "Sélection invalide. Recommencez l'extraction." };
  }
  if (!/^https:\/\/\S+$/i.test(sourceUrl)) return { status: "error", message: "Adresse de la page manquante." };
  const picked = candidates.filter((_, i) => selected.includes(String(i)));
  if (picked.length === 0) return { status: "error", message: "Sélectionnez au moins une personne." };

  const { supabase } = await requireUser();
  const app = applicationId ? await applicationFacts(supabase, applicationId) : null;
  let saved = 0;
  for (const c of picked) {
    const role_type = classifyRole(c.title, app?.facts.job_title);
    const facts = { current_title: c.title, department: null, work_location: null, role_type, has_mutual_connection: false, mutual_connection_note: null };
    const score = app ? computeRelevance(relevanceInputs(facts, app.facts)) : null;
    const { error } = await supabase.rpc("add_network_contact", {
      p: {
        first_name: c.firstName,
        last_name: c.lastName,
        current_title: c.title,
        company_name: companyName,
        company_domain: app && sameCompany(companyName, app.company) ? app.companyDomain : null,
        role_type,
        provider: "company_site",
        source_url: sourceUrl,
        raw_excerpt: c.line,
        // Présence sur une page officielle de l'entreprise : appartenance constatée à cette date.
        verified: true,
        verification_note: `Listé sur ${sourceUrl}`,
        ...(app && score ? { application_id: app.id, relevance_score: score.score, score_breakdown: score, strategy: strategyForRole(role_type) } : {}),
      },
    });
    if (error?.message?.includes("contact_daily_limit")) return { status: "error", message: `${saved} personne(s) ajoutée(s). ${DAILY_LIMIT}` };
    if (!error) saved++;
  }
  revalidateNetwork(applicationId);
  return { status: "success", message: `${saved} personne${saved > 1 ? "s" : ""} ajoutée${saved > 1 ? "s" : ""} à votre réseau.` };
}
