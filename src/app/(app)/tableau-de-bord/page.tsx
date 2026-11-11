import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CalendarCheck2, ListChecks, ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { computeSearchMetrics, countByStatus } from "@/server/analytics/metrics";
import { formatNumber, formatRate } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

const ACTIVE: ApplicationStatus[] = [
  "to_analyze", "to_prepare", "ready_to_send", "sent", "no_response", "followed_up",
  "interview_scheduled", "interview_done", "offer_received",
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const today = new Date().toISOString().slice(0, 10);

  const [profileRes, statusRes, oppRes, recoRes, reminderRes] = await Promise.all([
    supabase.from("user_profiles").select("first_name, onboarding_step, onboarding_completed_at").eq("id", user!.id).maybeSingle(),
    supabase.from("applications").select("status").is("archived_at", null),
    supabase
      .from("applications")
      .select("id, company_name, job_title, status, next_action, next_action_at, job_offers(coverage_score)")
      .is("archived_at", null)
      .in("status", ACTIVE)
      .order("next_action_at", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("recommendations")
      .select("id, title, reason, priority")
      .eq("for_date", today)
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .limit(3),
    supabase
      .from("reminders")
      .select("id, title, due_at")
      .is("completed_at", null)
      .lte("due_at", endOfDay.toISOString())
      .order("due_at")
      .limit(3),
  ]);

  const loadError = [statusRes, oppRes, recoRes, reminderRes].some((r) => r.error);
  const metrics = computeSearchMetrics(countByStatus(statusRes.data ?? []));
  const recommendations = recoRes.data ?? [];
  const reminders = reminderRes.data ?? [];
  const opportunities = oppRes.data ?? [];
  const firstName = profileRes.data?.first_name;

  return (
    <>
      <PageHeader
        title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
        description={dateFmt.format(new Date())}
        actions={
          <Button asChild>
            <Link href="/analyser">
              <ScanSearch />
              Analyser une offre
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4">
        {params["mot-de-passe"] === "modifie" ? <Alert tone="success">Votre mot de passe a été modifié.</Alert> : null}
        {params.bienvenue ? (
          <Alert tone="success" title="Votre profil est prêt.">
            Prochaine étape : analysez une offre qui vous intéresse.
          </Alert>
        ) : null}
        {profileRes.data && !profileRes.data.onboarding_completed_at ? (
          <div className="flex flex-wrap items-center gap-4 rounded-panel border border-emerald/30 bg-emerald-wash px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Complétez votre profil</p>
              <p className="text-sm text-muted">
                Étape {Math.min(5, (profileRes.data.onboarding_step ?? 0) + 1)} sur 5. Relance s&apos;en sert pour évaluer les offres et repérer les bonnes personnes.
              </p>
            </div>
            <Button size="sm" asChild>
              <Link href="/onboarding">Reprendre</Link>
            </Button>
          </div>
        ) : null}
        {loadError ? (
          <Alert tone="danger" title="Certaines données n'ont pas pu être chargées.">
            Rechargez la page. Si le problème persiste, vérifiez que les migrations de la base ont été appliquées.
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* 3. Que dois-je faire aujourd'hui ? — zone principale */}
          <Panel>
            <PanelHeader
              title="Aujourd'hui"
              description="Les trois actions les plus utiles, avec leur justification."
              action={
                <Link href="/actions" className="shrink-0 text-sm font-medium text-emerald hover:underline">
                  Toutes mes actions
                </Link>
              }
            />
            <PanelBody>
              {recommendations.length > 0 || reminders.length > 0 ? (
                <ol className="grid gap-3">
                  {reminders.map((r) => (
                    <li key={r.id} className="flex gap-3 rounded-control border border-line p-3">
                      <BellRing className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{r.title}</p>
                        <p className="text-sm text-muted">Rappel que vous avez programmé.</p>
                      </div>
                    </li>
                  ))}
                  {recommendations.map((r) => (
                    <li key={r.id} className="flex gap-3 rounded-control border border-line p-3">
                      <CalendarCheck2 className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{r.title}</p>
                        <p className="text-sm text-muted">{r.reason}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : metrics.total === 0 ? (
                <FirstSteps />
              ) : (
                <EmptyState
                  icon={CalendarCheck2}
                  title="Rien d'urgent aujourd'hui."
                  description="Vos recommandations quotidiennes apparaîtront ici dès que le moteur d'actions sera activé (phase 6). Vos rappels programmés s'affichent déjà."
                />
              )}
            </PanelBody>
          </Panel>

          {/* 1. Où en est ma recherche ? */}
          <Panel>
            <PanelHeader title="Ma recherche" />
            <PanelBody className="grid gap-5">
              <dl className="grid grid-cols-3 gap-3">
                <Metric label="Envoyées" value={formatNumber(metrics.sent)} />
                <Metric label="Taux de réponse" value={formatRate(metrics.responded, metrics.sent)} />
                <Metric label="Entretiens" value={formatNumber(metrics.interviews)} />
              </dl>
              <Pipeline stages={metrics.pipeline} total={metrics.total} />
              {metrics.awaiting > 0 ? (
                <p className="text-xs text-muted">
                  {formatNumber(metrics.awaiting)} candidature{metrics.awaiting > 1 ? "s" : ""} en attente de réponse. Un
                  silence n&apos;est pas un refus.
                </p>
              ) : null}
            </PanelBody>
          </Panel>
        </div>

        {/* 2. Quelles sont mes meilleures opportunités ? */}
        <Panel>
          <PanelHeader
            title="Opportunités en cours"
            description="Vos candidatures actives, de l'échéance la plus proche à la plus lointaine."
            action={
              <Link href="/candidatures" className="shrink-0 text-sm font-medium text-emerald hover:underline">
                Toutes mes candidatures
              </Link>
            }
          />
          {opportunities.length > 0 ? (
            <ul className="divide-y divide-line">
              {opportunities.map((o) => {
                const offer = Array.isArray(o.job_offers) ? o.job_offers[0] : o.job_offers;
                const coverage = offer?.coverage_score;
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
                    <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                      <p className="truncate font-medium">{o.job_title}</p>
                      <p className="truncate text-sm text-muted">{o.company_name}</p>
                    </div>
                    <Badge>{APPLICATION_STATUS_LABELS[o.status as ApplicationStatus]}</Badge>
                    <p className="text-sm tabular-nums text-muted sm:w-28" title="Estimation interne de couverture CV/offre, pas un score ATS">
                      {coverage != null ? `Couverture ${Math.round(Number(coverage))} %` : "Non analysée"}
                    </p>
                    <p className="truncate text-sm text-muted sm:w-36">
                      {o.next_action_at ? `${o.next_action ?? "Prochaine action"} · ${shortDateFmt.format(new Date(o.next_action_at))}` : "Aucune échéance"}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PanelBody>
              <EmptyState
                icon={ListChecks}
                title="Aucune candidature active."
                description="Ajoutez une offre qui vous intéresse : Relance l'analyse et vous aide à identifier les personnes à contacter."
                action={
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/analyser">Ajouter une offre</Link>
                  </Button>
                }
              />
            </PanelBody>
          )}
        </Panel>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value ?? <span className="text-faint">—</span>}</dd>
    </div>
  );
}

function Pipeline({ stages, total }: { stages: { key: string; label: string; count: number }[]; total: number }) {
  const shades = ["bg-line-strong", "bg-emerald/45", "bg-emerald/75", "bg-emerald", "bg-faint/40"];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label="Répartition des candidatures par étape">
        {total > 0
          ? stages.map((s, i) =>
              s.count > 0 ? <span key={s.key} className={shades[i]} style={{ width: `${(s.count / total) * 100}%` }} /> : null,
            )
          : null}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {stages.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-2 rounded-full ${shades[i]}`} />
            <span className="flex-1 text-muted">{s.label}</span>
            <span className="tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FirstSteps() {
  const steps = [
    { href: "/cv", title: "Importez votre CV", text: "Relance en extrait votre profil, que vous vérifiez avant tout usage." },
    { href: "/analyser", title: "Analysez une offre", text: "Voyez quels critères votre CV démontre et lesquels il ne montre pas encore." },
    { href: "/candidatures", title: "Suivez votre candidature", text: "Statut, relances et personnes à contacter au même endroit." },
  ];
  return (
    <div>
      <p className="mb-4 text-sm text-muted">Votre tableau de bord se remplira au fil de vos démarches. Pour commencer :</p>
      <ol className="grid gap-2">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="flex gap-4 rounded-control border border-line p-3 transition-colors hover:border-emerald/50 hover:bg-sunken">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-wash text-sm font-semibold tabular-nums text-emerald">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium">{s.title}</span>
                <span className="block text-sm text-muted">{s.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
