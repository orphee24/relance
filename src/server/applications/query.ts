import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/config/domain";
import { sanitizeSearch, type ListFilters } from "@/lib/validation/application";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ApplicationRow {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
  channel: string | null;
  applied_at: string | null;
  location: string | null;
  contract_type: string | null;
  salary_text: string | null;
  offer_url: string | null;
  next_action: string | null;
  next_action_at: string | null;
  created_at: string;
  archived_at: string | null;
  coverage: number | null;
}

export const MAX_LIST = 500;

/** Liste filtrée et triée ; la RLS limite toujours aux candidatures de l'utilisateur. */
export async function listApplications(supabase: Supabase, f: ListFilters): Promise<{ rows: ApplicationRow[]; error: boolean }> {
  let query = supabase
    .from("applications")
    .select(
      "id, company_name, job_title, status, channel, applied_at, location, contract_type, salary_text, offer_url, next_action, next_action_at, created_at, archived_at, job_offers(coverage_score)",
    )
    .limit(MAX_LIST);

  query = f.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (f.view === "table" && f.statuses.length) query = query.in("status", f.statuses);
  if (f.channel) query = query.eq("channel", f.channel);
  const q = sanitizeSearch(f.q);
  if (q) query = query.or(`company_name.ilike.%${q}%,job_title.ilike.%${q}%,location.ilike.%${q}%`);

  switch (f.sort) {
    case "next_action":
      query = query.order("next_action_at", { ascending: true, nullsFirst: false });
      break;
    case "applied":
      query = query.order("applied_at", { ascending: false, nullsFirst: false });
      break;
    case "company":
      query = query.order("company_name", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  const rows: ApplicationRow[] = (data ?? []).map((r) => {
    const offer = Array.isArray(r.job_offers) ? r.job_offers[0] : r.job_offers;
    const { job_offers: _offer, ...rest } = r as typeof r & { job_offers: unknown };
    void _offer;
    return { ...(rest as Omit<ApplicationRow, "coverage">), coverage: offer?.coverage_score != null ? Number(offer.coverage_score) : null };
  });
  if (f.sort === "coverage") rows.sort((a, b) => (b.coverage ?? -1) - (a.coverage ?? -1));
  return { rows, error: Boolean(error) };
}
