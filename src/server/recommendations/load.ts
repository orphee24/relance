import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/config/domain";
import { buildCandidates, pickTop, type Candidate, type Snapshot } from "./engine";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Date du jour en France (les recommandations sont quotidiennes, à l'heure de l'utilisateur). */
export function parisToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function loadSnapshot(supabase: Supabase, now = new Date()): Promise<Snapshot> {
  const [resumes, apps, events, network, links, interactions] = await Promise.all([
    supabase.from("resumes").select("user_verified_at"),
    supabase.from("applications").select("id, company_name, job_title, status, applied_at, next_action_at, offer_id, archived_at").is("archived_at", null).limit(500),
    supabase.from("application_events").select("application_id, occurred_at").eq("type", "follow_up_sent").limit(2000),
    supabase.from("user_network_contacts").select("id, status, follow_up_count, last_interaction_at, professional_contacts(full_name, role_type)").limit(2000),
    supabase.from("application_contacts").select("application_id, network_contact_id, relevance_score").limit(5000),
    supabase.from("networking_interactions").select("network_contact_id, type, occurred_at").order("occurred_at", { ascending: false }).limit(3000),
  ]);

  const lastType = new Map<string, string>();
  for (const i of interactions.data ?? []) if (!lastType.has(i.network_contact_id)) lastType.set(i.network_contact_id, i.type);

  return {
    now,
    hasVerifiedResume: (resumes.data ?? []).some((r) => r.user_verified_at),
    hasUnverifiedResume: (resumes.data ?? []).some((r) => !r.user_verified_at),
    applications: (apps.data ?? []).map((a) => ({
      id: a.id,
      company: a.company_name,
      jobTitle: a.job_title,
      status: a.status as ApplicationStatus,
      appliedAt: a.applied_at,
      nextActionAt: a.next_action_at,
      hasAnalysis: Boolean(a.offer_id),
      followUps: (events.data ?? []).filter((e) => e.application_id === a.id).map((e) => e.occurred_at),
      archived: Boolean(a.archived_at),
    })),
    contacts: (network.data ?? []).map((n) => {
      const pc = (Array.isArray(n.professional_contacts) ? n.professional_contacts[0] : n.professional_contacts) as { full_name: string; role_type: string } | null;
      const mine = (links.data ?? []).filter((l) => l.network_contact_id === n.id);
      return {
        networkId: n.id,
        name: pc?.full_name || "Contact",
        status: n.status,
        followUps: n.follow_up_count,
        lastInteractionAt: n.last_interaction_at,
        lastInteractionType: lastType.get(n.id) ?? null,
        applicationIds: mine.map((l) => l.application_id),
        score: mine.reduce<number | null>((m, l) => (l.relevance_score != null && (m === null || l.relevance_score > m) ? l.relevance_score : m), null),
        roleType: pc?.role_type ?? "other",
      };
    }),
  };
}

const key = (c: { kind: string; applicationId: string | null; networkContactId: string | null }) => `${c.kind}|${c.applicationId ?? ""}|${c.networkContactId ?? ""}`;

/**
 * Garantit les recommandations du jour. Sans `force`, ne recalcule pas si la journée a déjà été préparée
 * (les actions faites ou écartées restent acquises). Retourne aussi les autres pistes, calculées à la volée.
 */
export async function ensureTodayRecommendations(supabase: Supabase, opts: { force?: boolean; now?: Date } = {}): Promise<{ today: string; others: Candidate[] }> {
  const now = opts.now ?? new Date();
  const today = parisToday(now);
  const [{ data: existing }, snapshot] = await Promise.all([
    supabase.from("recommendations").select("kind, application_id, network_contact_id, status").eq("for_date", today),
    loadSnapshot(supabase, now),
  ]);
  const candidates = buildCandidates(snapshot);
  const closed = new Set((existing ?? []).filter((r) => r.status !== "pending").map((r) => key({ kind: r.kind, applicationId: r.application_id, networkContactId: r.network_contact_id })));
  const open = candidates.filter((c) => !closed.has(key(c)));

  if (opts.force || !existing?.length) {
    const remaining = Math.max(0, 3 - (existing ?? []).filter((r) => r.status === "done").length);
    const top = pickTop(open, opts.force ? remaining : 3);
    await supabase.rpc("replace_today_recommendations", {
      p_rows: top.map((c) => ({ kind: c.kind, priority: c.priority, title: c.title, reason: c.reason, application_id: c.applicationId ?? "", network_contact_id: c.networkContactId ?? "" })),
      p_date: today,
    });
  }

  const { data: current } = await supabase.from("recommendations").select("kind, application_id, network_contact_id").eq("for_date", today);
  const shown = new Set((current ?? []).map((r) => key({ kind: r.kind, applicationId: r.application_id, networkContactId: r.network_contact_id })));
  return { today, others: open.filter((c) => !shown.has(key(c))).slice(0, 7) };
}
