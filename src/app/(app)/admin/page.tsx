import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { setFlag } from "./actions";
import { PlanForm, type PlanRow } from "./plan-form";

export const metadata: Metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

const euro = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

const ACTIONS: Record<string, string> = {
  pass_granted: "Forfait attribué",
  payment_refunded: "Remboursement",
  plan_updated: "Forfait modifié",
  flag_updated: "Fonctionnalité modifiée",
};

interface Metrics {
  users_total: number;
  signups_7d: number;
  signups_30d: number;
  onboarding_completed: number;
  active_passes: Record<string, number>;
  revenue_30d_cents: number;
  refunds_30d: number;
  applications_total: number;
  applications_sent_30d: number;
  analyses_30d: number;
  contacts_total: number;
  messages_sent_30d: number;
  ai_cost_30d_micros: number;
  ai_by_feature_30d: Record<string, { calls: number; failures: number; tokens: number; cost_micros: number }>;
  deletion_requests_pending: number;
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const [{ data: m }, { data: plans }, { data: flags }, { data: audit }] = await Promise.all([
    supabase.rpc("admin_metrics"),
    supabase.from("plans").select("code, name, price_cents, active, quotas").order("price_cents"),
    supabase.rpc("admin_list_flags"),
    supabase.rpc("admin_recent_audit", { p_limit: 30 }),
  ]);
  const metrics = m as Metrics | null;

  const tiles: [string, string, string?][] = metrics
    ? [
        ["Utilisateurs", formatNumber(metrics.users_total), `+${metrics.signups_7d} sur 7 jours, +${metrics.signups_30d} sur 30 jours`],
        ["Onboarding terminé", formatNumber(metrics.onboarding_completed)],
        ["Forfaits actifs", Object.entries(metrics.active_passes).map(([k, v]) => `${v} ${k}`).join(" · ") || "0"],
        ["Revenu net 30 jours", euro(metrics.revenue_30d_cents), `${metrics.refunds_30d} remboursement(s)`],
        ["Candidatures", formatNumber(metrics.applications_total), `${metrics.applications_sent_30d} envoyées sur 30 jours`],
        ["Analyses 30 jours", formatNumber(metrics.analyses_30d)],
        ["Contacts réseau", formatNumber(metrics.contacts_total), `${metrics.messages_sent_30d} messages envoyés sur 30 jours`],
        ["Coût IA estimé 30 jours", euro(metrics.ai_cost_30d_micros / 10000)],
      ]
    : [];

  return (
    <>
      <PageHeader title="Administration" description="Indicateurs agrégés. Aucun CV, message, contact ou donnée personnelle n'est accessible depuis cet espace." />
      <div className="grid gap-4">
        {metrics?.deletion_requests_pending ? (
          <Alert tone="info" title={`${metrics.deletion_requests_pending} demande(s) de suppression en attente`}>
            À traiter sous 30 jours (traitement automatique prévu en phase 8).
          </Alert>
        ) : null}
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(([label, value, sub]) => (
            <Panel key={label}>
              <PanelBody className="grid gap-1">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                {sub ? <dd className="text-xs text-muted">{sub}</dd> : null}
              </PanelBody>
            </Panel>
          ))}
        </dl>

        {metrics && Object.keys(metrics.ai_by_feature_30d).length ? (
          <Panel>
            <PanelHeader title="Usage IA sur 30 jours" />
            <PanelBody className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1.5 font-medium">Fonctionnalité</th>
                    <th className="py-1.5 text-right font-medium">Appels</th>
                    <th className="py-1.5 text-right font-medium">Échecs</th>
                    <th className="py-1.5 text-right font-medium">Jetons</th>
                    <th className="py-1.5 text-right font-medium">Coût estimé</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metrics.ai_by_feature_30d).map(([f, v]) => (
                    <tr key={f} className="border-t border-line tabular-nums">
                      <td className="py-1.5">{f}</td>
                      <td className="py-1.5 text-right">{formatNumber(v.calls)}</td>
                      <td className="py-1.5 text-right">{formatNumber(v.failures)}</td>
                      <td className="py-1.5 text-right">{formatNumber(v.tokens)}</td>
                      <td className="py-1.5 text-right">{euro(v.cost_micros / 10000)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Forfaits" description="Prix et quotas. Toute modification est journalisée." />
          <PanelBody className="grid gap-6 md:grid-cols-3">
            {((plans ?? []) as PlanRow[]).map((p) => (
              <div key={p.code} className="grid content-start gap-3">
                <p className="font-semibold">{p.name}</p>
                <PlanForm plan={p} />
              </div>
            ))}
          </PanelBody>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Fonctionnalités" />
            <ul className="divide-y divide-line">
              {((flags ?? []) as { key: string; enabled: boolean; description: string | null }[]).map((f) => (
                <li key={f.key} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{f.description ?? f.key}</span>
                    <span className="block text-xs text-faint">{f.key}</span>
                  </span>
                  <Badge tone={f.enabled ? "emerald" : "neutral"}>{f.enabled ? "Activée" : "Désactivée"}</Badge>
                  <form action={setFlag}>
                    <input type="hidden" name="key" value={f.key} />
                    <input type="hidden" name="enabled" value={f.enabled ? "0" : "1"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {f.enabled ? "Désactiver" : "Activer"}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Journal" description="Actions sensibles, sans contenu." />
            {audit?.length ? (
              <ul className="divide-y divide-line">
                {(audit as { created_at: string; action: string; target_type: string | null; target_id: string | null }[]).map((a, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <ShieldCheck className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex-1">{ACTIONS[a.action] ?? a.action}{a.target_type === "plan" || a.target_type === "feature_flag" ? ` : ${a.target_id}` : ""}</span>
                    <span className="text-xs tabular-nums text-muted">{dateTimeFmt.format(new Date(a.created_at))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <PanelBody className="text-sm text-muted">Aucune action enregistrée.</PanelBody>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
