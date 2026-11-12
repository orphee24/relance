import { INTERVIEW_STATUSES, RESPONDED_STATUSES, SENT_STATUSES, type ApplicationStatus } from "@/config/domain";
import { CHANNELS, type Channel } from "@/lib/validation/application";

export const MIN_SAMPLE = 5;

export interface ChannelStat {
  channel: Channel | "unknown";
  label: string;
  sent: number;
  responded: number;
  interviews: number;
  responseRate: number | null;
  /** Moins de MIN_SAMPLE candidatures : taux non significatif. */
  smallSample: boolean;
}

/** Taux de réponse par canal. Ce sont des corrélations sur vos données, jamais des causes. */
export function statsByChannel(rows: { status: ApplicationStatus; channel: string | null }[]): ChannelStat[] {
  const groups = new Map<string, { sent: number; responded: number; interviews: number }>();
  for (const r of rows) {
    if (!SENT_STATUSES.includes(r.status)) continue;
    const key = r.channel && r.channel in CHANNELS ? r.channel : "unknown";
    const g = groups.get(key) ?? { sent: 0, responded: 0, interviews: 0 };
    g.sent++;
    if (RESPONDED_STATUSES.includes(r.status)) g.responded++;
    if (INTERVIEW_STATUSES.includes(r.status)) g.interviews++;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([channel, g]) => ({
      channel: channel as ChannelStat["channel"],
      label: channel === "unknown" ? "Canal non précisé" : CHANNELS[channel as Channel],
      ...g,
      responseRate: g.sent ? g.responded / g.sent : null,
      smallSample: g.sent < MIN_SAMPLE,
    }))
    .sort((a, b) => b.sent - a.sent);
}

/** Candidatures envoyées par semaine (lundi), sur les N dernières semaines. */
export function sentPerWeek(appliedDates: string[], weeks: number, now = new Date()): { weekStart: string; count: number }[] {
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const start = monday(now);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - 7 * (weeks - 1 - i));
    return { weekStart: d.toISOString().slice(0, 10), count: 0 };
  });
  for (const a of appliedDates) {
    const w = monday(new Date(`${a}T12:00:00Z`)).toISOString().slice(0, 10);
    const b = buckets.find((x) => x.weekStart === w);
    if (b) b.count++;
  }
  return buckets;
}
