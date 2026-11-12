import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus, Receipt } from "lucide-react";
import { PurchaseForm } from "@/components/billing/purchase-form";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, Badge, Progress } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon forfait" };
export const dynamic = "force-dynamic";

const euro = (cents: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

interface Quotas {
  offer_analyses: number | null;
  tracked_applications: number | null;
  ai_follow_ups: number | null;
  network_searches_per_day: number;
  interview_coach: boolean;
}
interface QuotaStatus {
  limit: number | null;
  used: number;
  remaining: number | null;
}

const PAYMENT_STATUS: Record<string, string> = {
  succeeded: "Payé",
  pending: "En attente",
  failed: "Échec",
  refunded: "Remboursé",
  partially_refunded: "Partiellement remboursé",
};

function quotaLines(q: Quotas): [string, string | boolean][] {
  return [
    ["Analyses d'offres", q.offer_analyses === null ? "Illimitées" : `${q.offer_analyses}`],
    ["Candidatures suivies", q.tracked_applications === null ? "Illimitées" : `${q.tracked_applications}`],
    ["Rédaction par IA", q.ai_follow_ups === null ? "Illimitée" : `${q.ai_follow_ups}`],
    ["Imports de contacts par jour", `${q.network_searches_per_day}`],
    ["Coach d'entretien", q.interview_coach],
  ];
}

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const { paiement } = await searchParams;
  const supabase = await createClient();
  const [{ data: ent }, { data: plans }, analyses, ai, network, { count: tracked }, { data: payments }, { data: checkoutEnabled }] = await Promise.all([
    supabase.rpc("my_entitlement"),
    supabase.from("plans").select("code, name, price_cents, duration_days, quotas, active").order("price_cents"),
    supabase.rpc("quota_status", { p_feature: "offer_analysis" }),
    supabase.rpc("quota_status", { p_feature: "ai_follow_up" }),
    supabase.rpc("quota_status", { p_feature: "network_search" }),
    supabase.from("applications").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("payments").select("id, amount_cents, refunded_cents, status, invoice_url, created_at, subscriptions(plan_code, starts_at, ends_at)").order("created_at", { ascending: false }).limit(50),
    supabase.rpc("feature_enabled", { p_key: "checkout" }),
  ]);
  const e = ent as { plan: string; quotas: Quotas; ends_at: string | null } | null;
  const current = e?.plan ?? "free";
  const quotas = e?.quotas;
  const usage: [string, QuotaStatus | null, string][] = [
    ["Analyses d'offres", analyses.data as QuotaStatus | null, current === "free" ? "sur 30 jours glissants" : "sur la période du forfait"],
    ["Rédaction par IA", ai.data as QuotaStatus | null, current === "free" ? "sur 30 jours glissants" : "sur la période du forfait"],
    ["Imports de contacts", network.data as QuotaStatus | null, "aujourd'hui"],
    ["Candidatures suivies", { limit: quotas?.tracked_applications ?? null, used: tracked ?? 0, remaining: null }, "actuellement"],
  ];

  return (
    <>
      <PageHeader
        title="Mon forfait"
        description="Forfaits de 30 jours, à paiement unique. Aucun renouvellement automatique : vous repassez en Free à la fin de la période."
        actions={
          <Link href="/parametres" className="text-sm font-medium text-emerald hover:underline">
            Retour aux paramètres
          </Link>
        }
      />
      <div className="grid gap-4">
        {paiement === "succes" ? (
          current === "free" ? (
            <Alert tone="info" title="Paiement reçu, confirmation en cours">
              L&apos;activation prend généralement quelques secondes. Rechargez la page dans un instant.
            </Alert>
          ) : (
            <Alert tone="success" title="Forfait activé">Merci. Votre reçu est disponible dans l&apos;historique ci-dessous.</Alert>
          )
        ) : null}
        {paiement === "annule" ? <Alert tone="info">Paiement annulé. Aucun montant n&apos;a été débité.</Alert> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Panel>
            <PanelHeader title={`Forfait actuel : ${(plans ?? []).find((p) => p.code === current)?.name ?? current}`} description={e?.ends_at ? `Actif jusqu'au ${dateFmt.format(new Date(e.ends_at))}.` : current === "free" ? "Sans limite de durée." : undefined} />
            <PanelBody className="grid gap-4">
              {usage.map(([label, q, period]) => (
                <div key={label} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {label} <span className="text-xs text-muted">{period}</span>
                    </span>
                    <span className="tabular-nums text-muted">{q ? (q.limit === null ? `${q.used} · illimité` : `${q.used} / ${q.limit}`) : "—"}</span>
                  </div>
                  {q && q.limit !== null ? <Progress value={(q.used / Math.max(1, q.limit)) * 100} label={`${label} : ${q.used} sur ${q.limit}`} /> : null}
                </div>
              ))}
            </PanelBody>
          </Panel>

          <div className="grid gap-4 sm:grid-cols-2">
            {(plans ?? [])
              .filter((p) => p.code !== "free" && p.active)
              .map((p) => {
                const isCurrent = p.code === current;
                return (
                  <Panel key={p.code} className={cn(isCurrent && "border-emerald")}>
                    <PanelBody className="grid h-full content-between gap-4">
                      <div className="grid gap-3">
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-semibold">{p.name}</p>
                          {isCurrent ? <Badge tone="emerald">Actif</Badge> : null}
                        </div>
                        <p>
                          <span className="text-3xl font-semibold tabular-nums">{euro(p.price_cents)}</span>{" "}
                          <span className="text-sm text-muted">pour {p.duration_days} jours</span>
                        </p>
                        <ul className="grid gap-1.5 text-sm">
                          {quotaLines(p.quotas as Quotas).map(([label, value]) => (
                            <li key={label} className="flex items-center justify-between gap-3">
                              <span className="text-muted">{label}</span>
                              {typeof value === "boolean" ? (
                                value ? <Check className="size-4 text-emerald" aria-label="Inclus" /> : <Minus className="size-4 text-faint" aria-label="Non inclus" />
                              ) : (
                                <span className="tabular-nums">{value}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {checkoutEnabled ? (
                        <PurchaseForm plan={p.code as "pro" | "premium"} label={`Choisir ${p.name}`} extends={isCurrent} />
                      ) : (
                        <p className="text-sm text-muted">Achat momentanément indisponible.</p>
                      )}
                    </PanelBody>
                  </Panel>
                );
              })}
          </div>
        </div>

        <Panel>
          <PanelHeader title="Historique des paiements" />
          {payments?.length ? (
            <ul className="divide-y divide-line">
              {payments.map((pay) => {
                const sub = (Array.isArray(pay.subscriptions) ? pay.subscriptions[0] : pay.subscriptions) as { plan_code: string; starts_at: string; ends_at: string } | null;
                return (
                  <li key={pay.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 text-sm">
                    <span className="w-36 text-muted">{dateFmt.format(new Date(pay.created_at))}</span>
                    <span className="min-w-0 flex-1">
                      {sub ? `${sub.plan_code === "premium" ? "Premium" : "Pro"} — du ${dateFmt.format(new Date(sub.starts_at))} au ${dateFmt.format(new Date(sub.ends_at))}` : "Forfait"}
                    </span>
                    <span className="tabular-nums">{euro(pay.amount_cents)}</span>
                    <Badge tone={pay.status === "succeeded" ? "emerald" : "neutral"}>{PAYMENT_STATUS[pay.status] ?? pay.status}</Badge>
                    {pay.invoice_url ? (
                      <a href={pay.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald hover:underline">
                        <Receipt className="size-4" aria-hidden="true" />
                        Reçu
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <PanelBody className="text-sm text-muted">Aucun paiement.</PanelBody>
          )}
        </Panel>
        <p className="text-xs text-muted">
          Paiement sécurisé par Stripe : Relance ne voit ni ne conserve vos données de carte. Pour une question sur un paiement ou un
          remboursement, contactez le support.
        </p>
      </div>
    </>
  );
}
