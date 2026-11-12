import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PersonCard } from "@/components/network/person-card";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody } from "@/components/ui/panel";
import { NETWORK_CONTACT_STATUS_LABELS } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { NETWORK_STATUSES, type NetworkStatus } from "@/lib/validation/network";
import { normalizeForMatch } from "@/server/cv/grounding";
import { loadNetworkList } from "@/server/network/load";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon réseau" };

export default async function NetworkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = (NETWORK_STATUSES as readonly string[]).includes(sp.statut ?? "") ? (sp.statut as NetworkStatus) : null;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const supabase = await createClient();
  const { people, error } = await loadNetworkList(supabase);

  const nq = normalizeForMatch(q);
  const filtered = people.filter(
    (p) => (!status || p.status === status) && (!nq || normalizeForMatch([p.name, p.title, p.company].filter(Boolean).join(" ")).includes(nq)),
  );
  const counts = Object.fromEntries(NETWORK_STATUSES.map((s) => [s, people.filter((p) => p.status === s).length]));
  const href = (patch: { statut?: string | null; q?: string }) => {
    const p = new URLSearchParams();
    const st = patch.statut === undefined ? status : patch.statut;
    const qq = patch.q === undefined ? q : patch.q;
    if (st) p.set("statut", st);
    if (qq) p.set("q", qq);
    return p.size ? `/reseau?${p}` : "/reseau";
  };

  return (
    <>
      <PageHeader
        title="Mon réseau"
        description="Les personnes que vous avez identifiées, d'où vient chaque information, et où en sont vos échanges."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/reseau/importer">
                <FileUp />
                Importer mes relations
              </Link>
            </Button>
            <Button asChild>
              <Link href="/reseau/nouveau">
                <UserPlus />
                Ajouter une personne
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4">
        {sp.supprime ? <Alert tone="success">La fiche et ses sources ont été supprimées.</Alert> : null}
        {error ? <Alert tone="danger">Votre réseau n&apos;a pas pu être chargé. Rechargez la page.</Alert> : null}

        {people.length > 0 ? (
          <div className="grid gap-3">
            <form role="search" action="/reseau" className="max-w-md">
              {status ? <input type="hidden" name="statut" value={status} /> : null}
              <input
                name="q"
                defaultValue={q}
                aria-label="Rechercher une personne, une fonction ou une entreprise"
                placeholder="Nom, fonction, entreprise…"
                className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-base focus-visible:border-emerald focus-visible:outline-none sm:text-sm"
              />
            </form>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par statut">
              <Link href={href({ statut: null })} className={cn("rounded-full border px-3 py-1 text-sm", !status ? "border-emerald bg-emerald-wash font-medium" : "border-line text-muted hover:text-ink")}>
                Tous <span className="tabular-nums">{people.length}</span>
              </Link>
              {NETWORK_STATUSES.filter((s) => counts[s]).map((s) => (
                <Link key={s} href={href({ statut: s })} className={cn("rounded-full border px-3 py-1 text-sm", status === s ? "border-emerald bg-emerald-wash font-medium" : "border-line text-muted hover:text-ink")}>
                  {NETWORK_CONTACT_STATUS_LABELS[s]} <span className="tabular-nums">{counts[s]}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <Panel>
          {filtered.length > 0 ? (
            <ul className="divide-y divide-line">
              {filtered.map((p) => (
                <PersonCard key={p.networkId} p={p} mode="list" />
              ))}
            </ul>
          ) : (
            <PanelBody>
              <EmptyState
                icon={Users}
                title={people.length ? "Aucune personne ne correspond." : "Votre réseau est vide pour le moment."}
                description={
                  people.length
                    ? undefined
                    : "Depuis une candidature, utilisez la recherche assistée pour repérer les bonnes personnes, ou importez vos relations existantes."
                }
              />
            </PanelBody>
          )}
        </Panel>
        <p className="text-xs text-muted">
          Les fiches non rattachées à une candidature en cours sont supprimées automatiquement après 12 mois.
        </p>
      </div>
    </>
  );
}
