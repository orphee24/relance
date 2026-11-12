import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Download, ListChecks, Plus } from "lucide-react";
import { DueLabel } from "@/components/applications/due-label";
import { FilterBar } from "@/components/applications/filter-bar";
import { KanbanBoard } from "@/components/applications/kanban";
import { StatusBadge } from "@/components/applications/status";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { CHANNELS, type Channel, listHref, parseListFilters } from "@/lib/validation/application";
import { waitingInfo } from "@/server/applications/insights";
import { listApplications, MAX_LIST } from "@/server/applications/query";

export const metadata: Metadata = { title: "Mes candidatures" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseListFilters(sp);
  const supabase = await createClient();

  const horizon = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  const [{ rows, error }, { count: activeCount }, { data: plan }, { data: reminders }, { data: upcoming }] = await Promise.all([
    listApplications(supabase, filters),
    supabase.from("applications").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.rpc("current_plan"),
    supabase
      .from("reminders")
      .select("id, title, due_at, application_id, applications(company_name, job_title)")
      .is("completed_at", null)
      .lte("due_at", horizon)
      .order("due_at")
      .limit(20),
    supabase
      .from("applications")
      .select("id, company_name, job_title, next_action, next_action_at")
      .is("archived_at", null)
      .not("next_action_at", "is", null)
      .lte("next_action_at", horizon)
      .order("next_action_at")
      .limit(20),
  ]);
  const { data: planRow } = await supabase.from("plans").select("quotas").eq("code", typeof plan === "string" ? plan : "free").maybeSingle();
  const limit = (planRow?.quotas as { tracked_applications?: number | null } | null)?.tracked_applications ?? null;
  const atLimit = limit !== null && (activeCount ?? 0) >= limit;

  const agenda = [
    ...(reminders ?? []).map((r) => {
      const app = Array.isArray(r.applications) ? r.applications[0] : r.applications;
      return { key: `r-${r.id}`, at: r.due_at as string, title: r.title as string, sub: app ? `${app.job_title} — ${app.company_name}` : null, href: r.application_id ? `/candidatures/${r.application_id}` : null };
    }),
    ...(upcoming ?? [])
      .map((r) => ({ key: `a-${r.id}`, at: r.next_action_at!, title: r.next_action ?? "Prochaine action", sub: `${r.job_title} — ${r.company_name}`, href: `/candidatures/${r.id}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const filtered = Boolean(filters.q || filters.statuses.length || filters.channel);

  return (
    <>
      <PageHeader
        title="Mes candidatures"
        description={
          limit !== null ? (
            <>
              {activeCount ?? 0} candidature{(activeCount ?? 0) > 1 ? "s" : ""} suivie{(activeCount ?? 0) > 1 ? "s" : ""} sur {limit} avec votre forfait.
            </>
          ) : (
            "Suivez chaque candidature, de l'analyse à la réponse."
          )
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <a href={listHref({ view: "table" }, filters).replace("/candidatures", "/api/candidatures/export")} download>
                <Download />
                Exporter (CSV)
              </a>
            </Button>
            {atLimit ? (
              <Button disabled title="Limite de votre forfait atteinte">
                <Plus />
                Nouvelle candidature
              </Button>
            ) : (
              <Button asChild>
                <Link href="/candidatures/nouvelle">
                  <Plus />
                  Nouvelle candidature
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        {sp.supprimee ? <Alert tone="success">La candidature a été supprimée.</Alert> : null}
        {atLimit ? (
          <Alert tone="info" title="Limite de votre forfait atteinte">
            Archivez une candidature terminée pour en suivre une nouvelle. Les candidatures archivées restent consultables.
          </Alert>
        ) : null}
        {error ? <Alert tone="danger">Vos candidatures n&apos;ont pas pu être chargées. Rechargez la page.</Alert> : null}

        <FilterBar filters={filters} />

        {rows.length === 0 && !error ? (
          <Panel>
            <PanelBody>
              {filtered || filters.archived ? (
                <EmptyState
                  icon={ListChecks}
                  title={filters.archived ? "Aucune candidature archivée." : "Aucune candidature ne correspond à ces filtres."}
                  action={
                    <Link href="/candidatures" className="text-sm font-medium text-emerald hover:underline">
                      Voir toutes mes candidatures
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  icon={ListChecks}
                  title="Aucune candidature pour le moment."
                  description="Ajoutez une candidature à la main, ou analysez une offre puis suivez-la en un clic."
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link href="/candidatures/nouvelle">Ajouter une candidature</Link>
                      </Button>
                      <Button size="sm" variant="secondary" asChild>
                        <Link href="/analyser">Analyser une offre</Link>
                      </Button>
                    </div>
                  }
                />
              )}
            </PanelBody>
          </Panel>
        ) : filters.view === "kanban" ? (
          <KanbanBoard
            items={rows.map((r) => ({
              id: r.id,
              company_name: r.company_name,
              job_title: r.job_title,
              status: r.status,
              applied_at: r.applied_at,
              next_action: r.next_action,
              next_action_at: r.next_action_at,
              coverage: r.coverage,
            }))}
          />
        ) : (
          <Panel>
            <div className="hidden grid-cols-[minmax(0,2.2fr)_9rem_minmax(0,1.2fr)_6rem_minmax(0,1.3fr)] gap-4 border-b border-line px-5 py-2.5 text-xs font-medium text-muted md:grid">
              <span>Poste</span>
              <span>Statut</span>
              <span>Suivi</span>
              <span className="text-right">Couverture</span>
              <span>Prochaine action</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const waiting = waitingInfo(r.status, r.applied_at);
                return (
                  <li key={r.id} className="relative grid gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-sunken md:grid-cols-[minmax(0,2.2fr)_9rem_minmax(0,1.2fr)_6rem_minmax(0,1.3fr)] md:items-center">
                    <div className="min-w-0">
                      <Link href={`/candidatures/${r.id}`} className="font-medium after:absolute after:inset-0 hover:text-emerald">
                        {r.job_title}
                      </Link>
                      <p className="truncate text-sm text-muted">
                        {[r.company_name, r.location].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-sm text-muted">
                      {waiting ? <span className={waiting.tone === "attention" ? "text-ink" : undefined}>{waiting.label}</span> : null}
                      {r.channel ? <span className="block truncate text-xs">{CHANNELS[r.channel as Channel]}</span> : null}
                    </p>
                    <p className="text-sm tabular-nums md:text-right" title="Estimation interne, pas un score ATS">
                      {r.coverage != null ? `${Math.round(r.coverage)} %` : <span className="text-faint">—</span>}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {r.next_action_at ? <DueLabel at={r.next_action_at} label={r.next_action} /> : r.next_action ?? <span className="text-faint">—</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
            {rows.length >= MAX_LIST ? (
              <PanelBody className="border-t border-line text-sm text-muted">Les {MAX_LIST} premières candidatures sont affichées. Affinez avec la recherche.</PanelBody>
            ) : null}
          </Panel>
        )}

        <Panel>
          <PanelHeader
            title="Agenda des 14 prochains jours"
            description="Vos rappels et prochaines actions."
            action={
              <Button variant="secondary" size="sm" asChild className="shrink-0 self-start">
                <a href="/api/candidatures/agenda.ics" download>
                  <CalendarDays />
                  Ajouter à mon agenda
                </a>
              </Button>
            }
          />
          {agenda.length ? (
            <ul className="divide-y divide-line">
              {agenda.map((a) => (
                <li key={a.key} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-5 py-3 text-sm">
                  <DueLabel at={a.at} className="w-40 shrink-0 tabular-nums" />
                  <span className="min-w-0 flex-1">
                    {a.href ? (
                      <Link href={a.href} className="font-medium hover:text-emerald hover:underline">
                        {a.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{a.title}</span>
                    )}
                    {a.sub ? <span className="block truncate text-muted">{a.sub}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <PanelBody className="text-sm text-muted">Rien de prévu. Ajoutez une prochaine action ou un rappel sur une candidature.</PanelBody>
          )}
        </Panel>
      </div>
    </>
  );
}
