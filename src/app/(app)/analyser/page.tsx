import type { Metadata } from "next";
import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { AnalyzeOfferForm, type VersionOption } from "@/components/offers/analyze-form";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analyser une offre" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

interface QuotaStatus {
  plan: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  window_end: string | null;
}

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ supprimee?: string }> }) {
  const { supprimee } = await searchParams;
  const supabase = await createClient();

  const [{ data: versions }, { data: quota }, { data: offers }] = await Promise.all([
    supabase
      .from("resume_versions")
      .select("id, label, version_no, resume_id, resumes!inner(title, is_primary)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("quota_status", { p_feature: "offer_analysis" }),
    supabase
      .from("job_offers")
      .select("id, title, company_name, coverage_score, analyzed_at")
      .not("analyzed_at", "is", null)
      .order("analyzed_at", { ascending: false })
      .limit(20),
  ]);

  // Dernière version de chaque CV en premier ; le CV principal présélectionné.
  const seen = new Set<string>();
  const options: VersionOption[] = (versions ?? []).map((v) => {
    const r = Array.isArray(v.resumes) ? v.resumes[0] : v.resumes;
    const latest = !seen.has(v.resume_id);
    seen.add(v.resume_id);
    return { id: v.id, label: `${r?.title ?? "CV"} — ${v.label ?? `version ${v.version_no}`}`, primary: Boolean(r?.is_primary && latest) };
  });

  const q = quota as QuotaStatus | null;
  const exhausted = q?.remaining === 0;

  return (
    <>
      <PageHeader
        title="Analyser une offre"
        description="Relance compare l'offre à votre CV vérifié, critère par critère, et vous montre ce qui est démontré et ce qui ne l'est pas."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Nouvelle analyse"
            action={
              q && q.limit !== null ? (
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {q.remaining} analyse{q.remaining === 1 ? "" : "s"} restante{q.remaining === 1 ? "" : "s"} sur {q.limit}
                </span>
              ) : null
            }
          />
          <PanelBody className="grid gap-4">
            {supprimee ? <Alert tone="success">L&apos;analyse a été supprimée.</Alert> : null}
            {exhausted ? (
              <Alert tone="info" title="Toutes vos analyses de la période sont utilisées.">
                {q?.plan === "free"
                  ? "Le forfait Free inclut 3 analyses sur 30 jours glissants."
                  : "Votre forfait actuel a atteint son nombre d'analyses."}{" "}
                Les forfaits payants seront disponibles prochainement.
              </Alert>
            ) : null}
            <AnalyzeOfferForm versions={options} disabled={exhausted} />
          </PanelBody>
        </Panel>

        <Panel className="self-start">
          <PanelHeader title="Analyses récentes" />
          {offers && offers.length > 0 ? (
            <ul className="divide-y divide-line">
              {offers.map((o) => (
                <li key={o.id}>
                  <Link href={`/analyser/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-sunken">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.title}</p>
                      <p className="truncate text-xs text-muted">
                        {o.company_name} · {dateFmt.format(new Date(o.analyzed_at!))}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {o.coverage_score != null ? `${Math.round(Number(o.coverage_score))} %` : <span className="font-normal text-faint">—</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <PanelBody>
              <EmptyState icon={ScanSearch} title="Aucune analyse pour le moment." description="Vos analyses apparaîtront ici." />
            </PanelBody>
          )}
        </Panel>
      </div>
    </>
  );
}
