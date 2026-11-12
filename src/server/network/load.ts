import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/config/domain";
import type { NetworkStatus } from "@/lib/validation/network";
import { normalizeCompanyName } from "@/lib/normalize";
import { recommendStrategy, relevanceInputs, strategyForRole, type ApplicationFacts, type RoleType, type Strategy } from "./engine";
import { computeRelevance, type RelevanceResult } from "./relevance";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PersonView {
  networkId: string;
  contactId: string;
  name: string;
  title: string | null;
  company: string | null;
  department: string | null;
  location: string | null;
  profileUrl: string | null;
  roleType: RoleType;
  status: NetworkStatus;
  confidence: "verified" | "inferred" | "unknown";
  lastVerifiedAt: string | null;
  providers: string[];
  hasMutual: boolean;
  mutualNote: string | null;
  followUps: number;
  relevance: RelevanceResult;
  strategy: Strategy;
}

const CONTACT_FIELDS =
  "id, status, has_mutual_connection, mutual_connection_note, follow_up_count, professional_contacts(id, full_name, current_title, company_name, department, work_location, profile_url, role_type, employment_confidence, last_verified_at, contact_sources(provider))";

interface NetworkRow {
  id: string;
  status: NetworkStatus;
  has_mutual_connection: boolean;
  mutual_connection_note: string | null;
  follow_up_count: number;
  professional_contacts: unknown;
}

function toView(row: NetworkRow, facts: ApplicationFacts | null): PersonView | null {
  const pc = (Array.isArray(row.professional_contacts) ? row.professional_contacts[0] : row.professional_contacts) as {
    id: string; full_name: string; current_title: string | null; company_name: string | null; department: string | null;
    work_location: string | null; profile_url: string | null; role_type: RoleType; employment_confidence: PersonView["confidence"];
    last_verified_at: string | null; contact_sources: { provider: string }[] | null;
  } | null;
  if (!pc) return null;
  const relevance = facts
    ? computeRelevance(relevanceInputs({ ...pc, has_mutual_connection: row.has_mutual_connection, mutual_connection_note: row.mutual_connection_note }, facts))
    : computeRelevance(relevanceInputs({ ...pc, has_mutual_connection: row.has_mutual_connection, mutual_connection_note: row.mutual_connection_note }, { job_title: "", location: null, department: null, status: "to_analyze" }));
  return {
    networkId: row.id,
    contactId: pc.id,
    name: pc.full_name || "Sans nom",
    title: pc.current_title,
    company: pc.company_name,
    department: pc.department,
    location: pc.work_location,
    profileUrl: pc.profile_url,
    roleType: pc.role_type,
    status: row.status,
    confidence: pc.employment_confidence,
    lastVerifiedAt: pc.last_verified_at,
    providers: Array.from(new Set((pc.contact_sources ?? []).map((s) => s.provider))),
    hasMutual: row.has_mutual_connection,
    mutualNote: row.mutual_connection_note,
    followUps: row.follow_up_count,
    relevance,
    strategy: strategyForRole(pc.role_type),
  };
}

export async function applicationFacts(supabase: Supabase, applicationId: string) {
  const { data } = await supabase
    .from("applications")
    .select("id, company_name, job_title, location, status, company_id, job_offers(department, url), companies(domain)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data) return null;
  const offer = Array.isArray(data.job_offers) ? data.job_offers[0] : data.job_offers;
  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  return {
    companyDomain: (company?.domain as string | null | undefined) ?? null,
    id: data.id as string,
    company: data.company_name as string,
    companyId: data.company_id as string | null,
    facts: { job_title: data.job_title, location: data.location, department: offer?.department ?? null, status: data.status as ApplicationStatus } satisfies ApplicationFacts,
  };
}

/** Personnes rattachées à une candidature, classées, et suggestions issues du réseau (même entreprise). */
export async function loadPeopleForApplication(supabase: Supabase, applicationId: string) {
  const app = await applicationFacts(supabase, applicationId);
  if (!app) return null;

  const [{ data: linked }, { data: sameCompany }] = await Promise.all([
    supabase.from("application_contacts").select(`network_contact_id, user_network_contacts(${CONTACT_FIELDS})`).eq("application_id", applicationId),
    // Suggestions : mêmes entreprises au nom normalisé identique (jamais sur simple ressemblance)
    supabase.from("user_network_contacts").select(`${CONTACT_FIELDS}`).limit(1000),
  ]);

  const linkedRows = (linked ?? [])
    .map((l) => (Array.isArray(l.user_network_contacts) ? l.user_network_contacts[0] : l.user_network_contacts) as NetworkRow | null)
    .filter((r): r is NetworkRow => Boolean(r));
  const people = linkedRows
    .map((r) => toView(r, app.facts))
    .filter((p): p is PersonView => Boolean(p))
    .sort((a, b) => Number(a.status === "do_not_contact") - Number(b.status === "do_not_contact") || b.relevance.score - a.relevance.score);

  const linkedIds = new Set(people.map((p) => p.networkId));
  const target = normalizeCompanyName(app.company);
  const suggestions = ((sameCompany ?? []) as NetworkRow[])
    .filter((r) => !linkedIds.has(r.id))
    .map((r) => toView(r, app.facts))
    .filter((p): p is PersonView => Boolean(p && target && normalizeCompanyName(p.company) === target && p.status !== "do_not_contact"))
    .sort((a, b) => b.relevance.score - a.relevance.score)
    .slice(0, 10);

  const recommendation = recommendStrategy(
    people.map((p) => ({
      id: p.networkId,
      role_type: p.roleType,
      has_mutual_connection: p.hasMutual,
      score: p.relevance.score,
      roleProximity: p.relevance.criteria.find((c) => c.key === "roleProximity")?.value ?? null,
      departmentProximity: p.relevance.criteria.find((c) => c.key === "departmentProximity")?.value ?? null,
      do_not_contact: p.status === "do_not_contact",
    })),
    app.facts.status,
  );

  return { app, people, suggestions, recommendation };
}

export async function loadNetworkContact(supabase: Supabase, networkId: string) {
  const { data } = await supabase.from("user_network_contacts").select(`${CONTACT_FIELDS}, notes, is_alumni, last_interaction_at, created_at`).eq("id", networkId).maybeSingle();
  if (!data) return null;
  const view = toView(data as unknown as NetworkRow, null);
  return view ? { view, notes: (data as { notes: string | null }).notes, isAlumni: (data as { is_alumni: boolean }).is_alumni } : null;
}

export async function loadNetworkList(supabase: Supabase): Promise<{ people: PersonView[]; error: boolean }> {
  const { data, error } = await supabase.from("user_network_contacts").select(CONTACT_FIELDS).order("updated_at", { ascending: false }).limit(2000);
  const people = ((data ?? []) as NetworkRow[]).map((r) => toView(r, null)).filter((p): p is PersonView => Boolean(p));
  return { people, error: Boolean(error) };
}
