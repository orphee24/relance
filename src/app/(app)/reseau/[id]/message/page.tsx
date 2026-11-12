import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageComposer } from "@/components/messages/composer";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { STRATEGIES, strategyForRole } from "@/server/network/engine";
import { loadMessageSetup } from "@/server/messages/load";
import type { Purpose } from "@/server/messages/templates";

export const metadata: Metadata = { title: "Préparer un message" };

export default async function ContactMessagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ candidature?: string }> }) {
  const { id } = await params;
  const { candidature } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Candidature : celle demandée, sinon la plus récente rattachée à cette personne.
  let applicationId = candidature && /^[0-9a-f-]{36}$/i.test(candidature) ? candidature : null;
  if (!applicationId) {
    const { data } = await supabase.from("application_contacts").select("application_id").eq("network_contact_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    applicationId = data?.application_id ?? null;
  }
  const setup = await loadMessageSetup(supabase, { networkId: id, applicationId, userId: user.id });
  if (!setup) notFound();

  const name = [setup.facts.recipient.firstName, setup.facts.recipient.lastName].filter(Boolean).join(" ") || "ce contact";
  const purposes: Purpose[] = ["first_contact", "follow_up", "intro_request", ...(setup.ctx.hadExchange ? (["thank_you"] as Purpose[]) : [])];
  const strategy = STRATEGIES[strategyForRole(setup.defaultRecipient === "recruiter" ? "recruiter" : setup.defaultRecipient === "manager" ? "manager" : "peer")];

  return (
    <>
      <PageHeader
        title={`Message pour ${name}`}
        description={
          <>
            {setup.facts.recipient.title ? `${setup.facts.recipient.title} · ` : ""}
            {setup.facts.company}
            {setup.facts.jobTitle ? ` · pour « ${setup.facts.jobTitle} »` : ""} —{" "}
            <Link href={`/reseau/${id}`} className="font-medium text-emerald hover:underline">
              voir la fiche
            </Link>
          </>
        }
      />
      {setup.doNotContact ? (
        <Alert tone="info" title="Ne plus contacter">Cette personne a été marquée « Ne plus contacter ». Aucun message ne peut être préparé.</Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel>
            <PanelBody>
              <MessageComposer
                kind="contact"
                networkId={id}
                applicationId={setup.applicationId}
                purposes={purposes}
                defaultPurpose="first_contact"
                allowedRecipients={setup.allowedRecipients}
                defaultRecipient={setup.defaultRecipient}
                ctx={setup.ctx}
              />
            </PanelBody>
          </Panel>
          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title={`Approche : ${strategy.label.toLowerCase()}`} />
              <PanelBody className="grid gap-2 text-sm">
                <p>{strategy.goal}</p>
                <p className="text-muted">{strategy.ask}</p>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Ce que le message peut utiliser" />
              <PanelBody className="grid gap-2 text-sm">
                <p>
                  <span className="font-medium">Réalisation citée :</span>{" "}
                  {setup.facts.strength ? `« ${setup.facts.strength} »` : <span className="text-muted">aucune (pas de CV vérifié ou pas de réalisation chiffrée)</span>}
                </p>
                {setup.strengthSource ? <p className="text-xs text-muted">{setup.strengthSource}</p> : null}
                <p>
                  <span className="font-medium">Connexion commune :</span> {setup.facts.mutualNote ?? <span className="text-muted">aucune enregistrée</span>}
                </p>
                <p>
                  <span className="font-medium">Échange passé :</span> {setup.ctx.hadExchange ? "oui, enregistré" : <span className="text-muted">aucun enregistré</span>}
                </p>
                <p className="text-xs text-muted">Rien d&apos;autre n&apos;est ajouté. Relance n&apos;envoie jamais de message à votre place.</p>
              </PanelBody>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
