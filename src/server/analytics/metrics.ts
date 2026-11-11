import {
  type ApplicationStatus,
  INTERVIEW_STATUSES,
  PIPELINE_STAGES,
  RESPONDED_STATUSES,
  SENT_STATUSES,
} from "@/config/domain";

export type StatusCounts = Partial<Record<ApplicationStatus, number>>;

export interface SearchMetrics {
  total: number;
  sent: number;
  awaiting: number;
  responded: number;
  interviews: number;
  offers: number;
  negative: number;
  /** null quand aucune candidature n'a été envoyée : on n'affiche pas un faux 0 %. */
  responseRate: number | null;
  interviewRate: number | null;
  pipeline: { key: string; label: string; count: number }[];
}

const sum = (counts: StatusCounts, statuses: ApplicationStatus[]) =>
  statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);

export function computeSearchMetrics(counts: StatusCounts): SearchMetrics {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const sent = sum(counts, SENT_STATUSES);
  const responded = sum(counts, RESPONDED_STATUSES);
  const interviews = sum(counts, INTERVIEW_STATUSES);
  return {
    total,
    sent,
    // « Sans réponse » et « Relancée » restent en attente : jamais comptées comme refus.
    awaiting: sum(counts, ["sent", "no_response", "followed_up"]),
    responded,
    interviews,
    offers: sum(counts, ["offer_received", "accepted"]),
    negative: counts.rejected ?? 0,
    responseRate: sent > 0 ? responded / sent : null,
    interviewRate: sent > 0 ? interviews / sent : null,
    pipeline: PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label, count: sum(counts, s.statuses) })),
  };
}

export function countByStatus(rows: { status: ApplicationStatus }[]): StatusCounts {
  return rows.reduce<StatusCounts>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
}
