import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { ApplicationStatus } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatRate } from "@/lib/utils";
import { MIN_SAMPLE, sentPerWeek, statsByChannel } from "@/server/analytics/channels";
import { computeSearchMetrics, countByStatus } from "@/server/analytics/metrics";

export const metadata: Metadata = { title: "Statistiques" };

const weekFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKS = 8;

export default async function StatsPage() {
  const supabase = await createClient();
  const [{ data: apps }, { data: network }, { data: drafts }] = await Promise.all([
    supabase.from("applications").select("status, channel, applied_at").limit(5000),
    supabase.from("user_network_contacts").select("status").limit(5000),
    supabase.from("message_drafts").select("sent_at").limit(5000),
  ]);
  const rows = (apps ?? []) as { status: ApplicationStatus; channel: string | null; applied_at: string | null }[];
  const m = computeSearchMetrics(countByStatus(rows));
  const channels = statsByChannel(rows);
  const weeks = sentPerWeek(rows.map((r) => r.applied_at).filter((d): d is string => Boolean(d)), WEEKS);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));
  const net = network ?? [];
  const contacted = net.filter((n) => !["identified", "to_contact", "message_ready"].includes(n.status)).length;
  const replied = net.filter((n) => ["replied", "in_conversation", "intro_proposed", "intro_obtained"].includes(n.status)).length;
  const intros = net.filter((n) => n.status === "intro_obtained").length;
  const sentMessages = (drafts ?? []).filter((d) => d.sent_at).length;

  if (rows.length === 0 && net.length === 0) {
    return (
      <>
        <PageHeader title="Statistiques" description="Mesurez ce qui fonctionne dans votre recherche." />
        <Panel>
          <PanelBody>
            <EmptyState icon={BarChart3} title="Pas encore de données." description="Vos statistiques apparaîtront dès vos premières candidatures envoyées." />
          </PanelBody>
        </Panel>
      </>
    );
  }

  const tiles: [string, string | null, string][] = [
    ["Candidatures envoyées", formatNumber(m.sent), `${formatNumber(m.total)} suivies au total`],
    ["Taux de réponse", formatRate(m.responded, m.sent), "Entretien, offre ou refus explicite"],
    ["Taux d'entretien", formatRate(m.interviews, m.sent), `${formatNumber(m.interviews)} candidature${m.interviews > 1 ? "s" : ""}`],
    ["En attente", formatNumber(m.awaiting), "Un silence n'est pas un refus"],
  ];

  return (
    <>
      <PageHeader title="Statistiques" description="Calculées sur vos propres données. Ce sont des tendances et des corrélations, pas des causes." />
      <div className="grid gap-4">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(([label, value, sub]) => (
            <Panel key={label}>
              <PanelBody className="grid gap-1">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{value ?? <span className="text-faint">—</span>}</dd>
                <dd className="text-xs text-muted">{sub}</dd>
              </PanelBody>
            </Panel>
          ))}
        </dl>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Candidatures envoyées par semaine" description={`${WEEKS} dernières semaines, selon la date d'envoi.`} />
            <PanelBody>
              <div className="flex h-40 items-end gap-2" role="img" aria-label={`Candidatures envoyées par semaine : ${weeks.map((w) => `semaine du ${weekFmt.format(new Date(w.weekStart))}, ${w.count}`).join(" ; ")}`}>
                {weeks.map((w) => (
                  <div key={w.weekStart} className="group relative flex h-full flex-1 flex-col justify-end" title={`Semaine du ${weekFmt.format(new Date(w.weekStart))} : ${w.count}`}>
                    <span className="mb-1 text-center text-xs tabular-nums text-muted">{w.count || ""}</span>
                    <span
                      className="rounded-t-[4px] bg-emerald transition-opacity group-hover:opacity-80"
                      style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: w.count ? 2 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 border-t border-line pt-2">
                {weeks.map((w, i) => (
                  <span key={w.weekStart} className="flex-1 text-center text-xs text-muted">
                    {i % 2 === 1 || weeks.length <= 4 ? weekFmt.format(new Date(w.weekStart)) : ""}
                  </span>
                ))}
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted hover:text-ink">Voir les valeurs</summary>
                <table className="mt-2 w-full text-left">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 font-medium">Semaine du</th>
                      <th className="py-1 text-right font-medium">Envoyées</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.weekStart} className="border-t border-line">
                        <td className="py-1">{weekFmt.format(new Date(w.weekStart))}</td>
                        <td className="py-1 text-right tabular-nums">{w.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Taux de réponse par canal" description={`Un taux calculé sur moins de ${MIN_SAMPLE} candidatures n'est pas significatif.`} />
            {channels.length ? (
              <ul className="divide-y divide-line">
                {channels.map((c) => (
                  <li key={c.channel} className="grid gap-1.5 px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{c.label}</span>
                      <span className="tabular-nums text-muted">
                        {c.smallSample ? (
                          `${c.responded} réponse${c.responded > 1 ? "s" : ""} sur ${c.sent}`
                        ) : (
                          <>
                            <span className="font-semibold text-ink">{formatRate(c.responded, c.sent)}</span> · {c.responded}/{c.sent}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${c.smallSample ? "bg-line-strong" : "bg-emerald"}`}
                        style={{ width: `${(c.responseRate ?? 0) * 100}%` }}
                      />
                    </div>
                    {c.smallSample ? <span className="text-xs text-faint">Trop peu de candidatures pour un taux.</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <PanelBody className="text-sm text-muted">Aucune candidature envoyée pour le moment.</PanelBody>
            )}
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Réseau" description="Vos démarches auprès des personnes identifiées." />
          <PanelBody>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {(
                [
                  ["Personnes identifiées", net.length],
                  ["Contactées", contacted],
                  ["Ont répondu", replied],
                  ["Introductions obtenues", intros],
                  ["Messages envoyés via Relance", sentMessages],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {contacted >= MIN_SAMPLE ? (
              <p className="mt-4 text-sm text-muted">Taux de réponse de vos prises de contact : {formatRate(replied, contacted)}.</p>
            ) : null}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
