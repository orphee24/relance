import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Check, RefreshCw, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { hrefFor, type RecommendationKind } from "@/server/recommendations/engine";
import { ensureTodayRecommendations } from "@/server/recommendations/load";
import { refreshRecommendations, setRecommendationStatus } from "../_actions/recommendations";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mes actions" };
export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

export default async function ActionsPage() {
  const supabase = await createClient();
  const { today, others } = await ensureTodayRecommendations(supabase);
  const { data: recs } = await supabase
    .from("recommendations")
    .select("id, kind, title, reason, priority, status, application_id, network_contact_id")
    .eq("for_date", today)
    .order("priority", { ascending: false });
  const list = recs ?? [];
  const pending = list.filter((r) => r.status === "pending");
  const closed = list.filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader
        title="Mes actions"
        description={`Les actions les plus utiles pour ${dayFmt.format(new Date())}, chacune avec sa raison. Calculées à partir de vos candidatures, de votre réseau et de votre CV.`}
        actions={
          <form action={refreshRecommendations}>
            <SubmitButton variant="secondary" pendingLabel="Mise à jour…" className="w-auto">
              <RefreshCw />
              Mettre à jour
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Aujourd'hui" description={pending.length ? `${pending.length} action${pending.length > 1 ? "s" : ""} à faire.` : undefined} />
          {list.length ? (
            <ol className="divide-y divide-line">
              {[...pending, ...closed].map((r, i) => {
                const done = r.status !== "pending";
                return (
                  <li key={r.id} className={cn("grid gap-3 px-5 py-4 sm:grid-cols-[2rem_minmax(0,1fr)]", done && "opacity-60")}>
                    <span className={cn("hidden size-7 place-items-center rounded-full text-sm font-semibold tabular-nums sm:grid", done ? "bg-sunken text-muted" : "bg-emerald-wash text-emerald")}>
                      {done ? <Check className="size-4" aria-label={r.status === "done" ? "Faite" : "Écartée"} /> : i + 1}
                    </span>
                    <div className="grid gap-2">
                      <div>
                        <p className={cn("font-medium", done && "line-through")}>{r.title}</p>
                        <p className="text-sm text-muted">{r.reason}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {done ? (
                          <form action={setRecommendationStatus}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="pending" />
                            <Button type="submit" variant="ghost" size="sm">
                              <RotateCcw />
                              {r.status === "done" ? "Pas encore faite" : "Rétablir"}
                            </Button>
                          </form>
                        ) : (
                          <>
                            <Button size="sm" asChild>
                              <Link href={hrefFor({ kind: r.kind as RecommendationKind, applicationId: r.application_id, networkContactId: r.network_contact_id })}>
                                <ArrowUpRight />
                                Y aller
                              </Link>
                            </Button>
                            <form action={setRecommendationStatus}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="done" />
                              <Button type="submit" variant="secondary" size="sm">
                                <Check />
                                C&apos;est fait
                              </Button>
                            </form>
                            <form action={setRecommendationStatus}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="dismissed" />
                              <Button type="submit" variant="ghost" size="sm">
                                <X />
                                Pas aujourd&apos;hui
                              </Button>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <PanelBody>
              <EmptyState
                title="Rien de prioritaire aujourd'hui."
                description="Ajoutez une candidature ou identifiez des personnes dans les entreprises qui vous intéressent : Relance vous proposera les prochaines étapes."
                action={
                  <Link href="/candidatures/nouvelle" className="text-sm font-medium text-emerald hover:underline">
                    Ajouter une candidature
                  </Link>
                }
              />
            </PanelBody>
          )}
        </Panel>

        <Panel className="self-start">
          <PanelHeader title="Autres pistes" description="Utiles aussi, mais moins urgentes." />
          {others.length ? (
            <ul className="divide-y divide-line">
              {others.map((c) => (
                <li key={`${c.kind}-${c.applicationId}-${c.networkContactId}`}>
                  <Link href={hrefFor(c)} className="block px-5 py-3 transition-colors hover:bg-sunken">
                    <span className="block text-sm font-medium">{c.title}</span>
                    <span className="block text-xs text-muted">{c.reason}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <PanelBody className="text-sm text-muted">Aucune autre piste pour le moment.</PanelBody>
          )}
        </Panel>
      </div>
      <p className="mt-4 text-xs text-muted">
        Relance ne propose jamais de relancer plus de deux fois sans réponse, ni de contacter une personne marquée « Ne plus contacter ».
      </p>
    </>
  );
}
