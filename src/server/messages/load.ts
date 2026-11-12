import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/config/domain";
import { resumeProfileSchema } from "@/lib/validation/resume-profile";
import { storedAnalysisSchema } from "@/lib/validation/offer";
import { isQuantified } from "@/server/cv/heuristic-parser";
import type { CheckContext } from "./checks";
import { defaultRecipient, type MessageFacts, type RecipientType } from "./templates";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const NOT_SENT: ApplicationStatus[] = ["to_analyze", "to_prepare", "ready_to_send"];

export interface MessageSetup {
  facts: MessageFacts;
  ctx: Omit<CheckContext, "format">;
  defaultRecipient: RecipientType;
  allowedRecipients: RecipientType[];
  networkId: string | null;
  applicationId: string | null;
  doNotContact: boolean;
  /** Origine de la réalisation citée, pour l'afficher à l'utilisateur. */
  strengthSource: string | null;
}

/** Réalisation à citer : prouvée par le CV vérifié, de préférence chiffrée et liée à un critère de l'offre. */
async function pickStrength(supabase: Supabase, offerExtracted: unknown): Promise<{ text: string; source: string } | null> {
  const analysis = storedAnalysisSchema.safeParse(offerExtracted);
  if (analysis.success) {
    const demonstrated = analysis.data.requirements
      .filter((r) => r.coverage === "demonstrated" && r.resumeEvidence && r.category !== "experience" && r.category !== "education")
      .flatMap((r) => r.resumeEvidence!.split("\n").map((line) => ({ line, kind: r.kind, label: r.label })))
      .filter((x) => x.line.length >= 25 && x.line.length <= 220);
    const best = demonstrated.find((x) => isQuantified(x.line) && x.kind === "mandatory") ?? demonstrated.find((x) => isQuantified(x.line)) ?? demonstrated[0];
    if (best) return { text: best.line, source: `Extrait de votre CV vérifié, qui démontre « ${best.label} ».` };
  }
  const { data } = await supabase
    .from("resume_versions")
    .select("content, resumes!inner(is_primary)")
    .eq("resumes.is_primary", true)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const profile = resumeProfileSchema.safeParse(data?.content);
  if (!profile.success) return null;
  const achievement = profile.data.experiences.flatMap((x) => x.achievements).find((a) => isQuantified(a) && a.length <= 220);
  return achievement ? { text: achievement, source: "Réalisation chiffrée de votre CV principal vérifié." } : null;
}

export async function loadMessageSetup(supabase: Supabase, input: { networkId: string | null; applicationId: string | null; userId: string }): Promise<MessageSetup | null> {
  const [{ data: profile }, appRes, contactRes] = await Promise.all([
    supabase.from("user_profiles").select("first_name, last_name, target_job").eq("id", input.userId).maybeSingle(),
    input.applicationId
      ? supabase.from("applications").select("id, company_name, job_title, status, applied_at, job_offers(extracted)").eq("id", input.applicationId).maybeSingle()
      : Promise.resolve({ data: null }),
    input.networkId
      ? supabase
          .from("user_network_contacts")
          .select("id, status, has_mutual_connection, mutual_connection_note, is_alumni, professional_contacts(first_name, last_name, current_title, company_name, role_type)")
          .eq("id", input.networkId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const app = appRes.data as { id: string; company_name: string; job_title: string; status: ApplicationStatus; applied_at: string | null; job_offers: unknown } | null;
  const contact = contactRes.data as {
    id: string; status: string; has_mutual_connection: boolean; mutual_connection_note: string | null; is_alumni: boolean; professional_contacts: unknown;
  } | null;
  if (input.applicationId && !app) return null;
  if (input.networkId && !contact) return null;
  const pc = contact ? ((Array.isArray(contact.professional_contacts) ? contact.professional_contacts[0] : contact.professional_contacts) as {
    first_name: string | null; last_name: string | null; current_title: string | null; company_name: string | null; role_type: string;
  } | null) : null;

  let hadExchange = false;
  if (contact) {
    const { count } = await supabase
      .from("networking_interactions")
      .select("id", { count: "exact", head: true })
      .eq("network_contact_id", contact.id)
      .in("type", ["reply_received", "call", "meeting"]);
    hadExchange = (count ?? 0) > 0;
  }

  const offer = app ? (Array.isArray(app.job_offers) ? app.job_offers[0] : app.job_offers) as { extracted: unknown } | null : null;
  const strength = await pickStrength(supabase, offer?.extracted);
  const hasMutual = Boolean(contact?.has_mutual_connection && contact.mutual_connection_note);
  const isAlumni = Boolean(contact?.is_alumni);
  const allowed: RecipientType[] = ["peer", "manager", "recruiter", "introducer"];
  if (hasMutual) allowed.push("mutual");
  if (isAlumni) allowed.push("alumni");

  return {
    facts: {
      recipient: { firstName: pc?.first_name ?? null, lastName: pc?.last_name ?? null, title: pc?.current_title ?? null },
      recipientType: pc ? defaultRecipient(pc.role_type, hasMutual, isAlumni) : "recruiter",
      company: app?.company_name ?? pc?.company_name ?? "l'entreprise",
      jobTitle: app?.job_title ?? profile?.target_job ?? null,
      applied: app ? !NOT_SENT.includes(app.status) : false,
      appliedOn: app?.applied_at ?? null,
      sender: { firstName: profile?.first_name ?? null, lastName: profile?.last_name ?? null, headline: profile?.target_job ?? null },
      strength: strength?.text ?? null,
      mutualNote: hasMutual ? contact!.mutual_connection_note : null,
      isAlumni,
      introTarget: null,
    },
    ctx: { hadExchange, hasMutual, isAlumni },
    defaultRecipient: pc ? defaultRecipient(pc.role_type, hasMutual, isAlumni) : "recruiter",
    allowedRecipients: allowed,
    networkId: contact?.id ?? null,
    applicationId: app?.id ?? null,
    doNotContact: contact?.status === "do_not_contact",
    strengthSource: strength?.source ?? null,
  };
}
