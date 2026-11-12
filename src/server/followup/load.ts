import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/config/domain";
import { storedAnalysisSchema } from "@/lib/validation/offer";
import { diagnoseSilence, type Diagnosis } from "./diagnosis";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadDiagnosis(supabase: Supabase, applicationId: string): Promise<{ company: string; jobTitle: string; followUpCount: number; diagnosis: Diagnosis } | null> {
  const [{ data: app }, { data: events }, { data: links }] = await Promise.all([
    supabase.from("applications").select("id, company_name, job_title, status, applied_at, channel, job_offers(coverage_score, extracted)").eq("id", applicationId).maybeSingle(),
    supabase.from("application_events").select("occurred_at").eq("application_id", applicationId).eq("type", "follow_up_sent"),
    supabase.from("application_contacts").select("user_network_contacts(status)").eq("application_id", applicationId),
  ]);
  if (!app) return null;
  const offer = (Array.isArray(app.job_offers) ? app.job_offers[0] : app.job_offers) as { coverage_score: number | null; extracted: unknown } | null;
  const analysis = storedAnalysisSchema.safeParse(offer?.extracted);
  const statuses = (links ?? []).map((l) => {
    const n = Array.isArray(l.user_network_contacts) ? l.user_network_contacts[0] : l.user_network_contacts;
    return (n as { status: string } | null)?.status ?? "identified";
  }).filter((s) => s !== "do_not_contact");
  const contacted = statuses.filter((s) => !["identified", "to_contact", "message_ready"].includes(s)).length;
  const replied = statuses.filter((s) => ["replied", "in_conversation", "intro_proposed", "intro_obtained"].includes(s)).length;

  return {
    company: app.company_name,
    jobTitle: app.job_title,
    followUpCount: events?.length ?? 0,
    diagnosis: diagnoseSilence({
      status: app.status as ApplicationStatus,
      appliedAt: app.applied_at,
      channel: app.channel,
      followUps: (events ?? []).map((e) => ({ at: e.occurred_at })),
      contacts: { total: statuses.length, contacted, replied },
      coverage: offer?.coverage_score != null ? Number(offer.coverage_score) : null,
      missingMandatory: analysis.success
        ? analysis.data.requirements.filter((r) => r.kind === "mandatory" && (r.coverage === "missing" || r.coverage === "unknown") && r.category !== "soft_skill").map((r) => r.label)
        : [],
    }),
  };
}
