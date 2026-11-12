import Link from "next/link";
import { FileText, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { createClient } from "@/lib/supabase/server";
import { STRATEGIES } from "@/server/network/engine";
import { loadPeopleForApplication } from "@/server/network/load";
import { PersonCard } from "./person-card";
import { SearchLinks } from "./search-links";

/** Onglet « Personnes à contacter » d'une candidature (spécification NETWORK_ENGINE §4). */
export async function PeoplePanel({ supabase, applicationId, archived }: { supabase: Awaited<ReturnType<typeof createClient>>; applicationId: string; archived: boolean }) {
  const data = await loadPeopleForApplication(supabase, applicationId);
  if (!data) return null;
  return <PeoplePanelView data={data} archived={archived} />;
}

export function PeoplePanelView({ data, archived }: { data: NonNullable<Awaited<ReturnType<typeof loadPeopleForApplication>>>; archived: boolean }) {
  const { app, people, suggestions, recommendation } = data;
  const recommended = recommendation ? people.find((p) => p.networkId === recommendation.contactId) : null;

  return (
    <Panel id="personnes" className="scroll-mt-6">
      <PanelHeader
        title={`Personnes à contacter${people.length ? ` (${people.length})` : ""}`}
        description="Classées par pertinence pour une prise de contact. Vous envoyez vous-même chaque message."
        action={
          archived ? null : (
            <Button variant="secondary" size="sm" asChild className="shrink-0 self-start">
              <Link href={`/reseau/nouveau?candidature=${app.id}`}>
                <UserPlus />
                Ajouter une personne
              </Link>
            </Button>
          )
        }
      />

      {recommendation && recommended ? (
        <PanelBody className="grid gap-1.5 border-b border-line bg-emerald-wash/50">
          <p className="text-sm font-medium">
            Approche suggérée : {STRATEGIES[recommendation.strategy].label.toLowerCase()} — {recommended.name}
          </p>
          <p className="text-sm text-muted">{recommendation.reason}</p>
          <p className="text-sm">
            <span className="font-medium">Objectif :</span> {STRATEGIES[recommendation.strategy].goal}{" "}
            <span className="text-muted">{STRATEGIES[recommendation.strategy].ask}</span>
          </p>
          <p className="text-xs text-muted">La rédaction assistée des messages arrive avec la phase 6.</p>
        </PanelBody>
      ) : null}

      {people.length > 0 ? (
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <PersonCard key={p.networkId} p={p} applicationId={app.id} mode="linked" />
          ))}
        </ul>
      ) : (
        <PanelBody>
          <EmptyState
            icon={Users}
            title="Aucun contact vérifié trouvé pour le moment."
            description="Relance ne propose jamais de profil inventé. Utilisez la recherche assistée ci-dessous, importez vos relations, ou repérez les personnes listées sur les pages officielles de l'entreprise."
          />
        </PanelBody>
      )}

      {suggestions.length > 0 ? (
        <div className="border-t border-line">
          <PanelBody className="pb-0">
            <p className="text-sm font-medium">Dans votre réseau chez {app.company}</p>
            <p className="text-xs text-muted">Rapprochées par le nom de l&apos;entreprise déclaré : vérifiez qu&apos;elles y travaillent toujours.</p>
          </PanelBody>
          <ul className="divide-y divide-line">
            {suggestions.map((p) => (
              <PersonCard key={p.networkId} p={p} applicationId={app.id} mode="suggestion" />
            ))}
          </ul>
        </div>
      ) : null}

      {archived ? null : (
        <>
          <details className="border-t border-line" open={people.length === 0}>
            <summary className="cursor-pointer select-none px-5 py-3.5 text-sm font-medium hover:bg-sunken">Recherche assistée</summary>
            <PanelBody className="pt-0">
              <SearchLinks company={app.company} jobTitle={app.facts.job_title} />
            </PanelBody>
          </details>
          <PanelBody className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line text-sm">
            <Link href={`/reseau/importer`} className="font-medium text-emerald hover:underline">
              Importer mes relations
            </Link>
            {app.companyId ? (
              <Link href={`/entreprises/${app.companyId}?candidature=${app.id}#page-equipe`} className="inline-flex items-center gap-1.5 font-medium text-emerald hover:underline">
                <FileText className="size-3.5" aria-hidden="true" />
                Repérer les personnes d&apos;une page « équipe »
              </Link>
            ) : null}
          </PanelBody>
        </>
      )}
      {people.some((p) => p.followUps >= 2 && p.status === "no_response") ? (
        <PanelBody className="border-t border-line">
          <Alert tone="info">Certaines personnes ont déjà été relancées deux fois sans réponse : mieux vaut ne pas insister.</Alert>
        </PanelBody>
      ) : null}
    </Panel>
  );
}
