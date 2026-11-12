import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageComposer } from "@/components/messages/composer";
import { DiagnosisPanel } from "@/components/messages/diagnosis-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { loadDiagnosis } from "@/server/followup/load";
import { loadMessageSetup } from "@/server/messages/load";

export const metadata: Metadata = { title: "Relancer une candidature" };

export default async function FollowUpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string }> }) {
  const { id } = await params;
  const { erreur } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const diagnosis = await loadDiagnosis(supabase, id);
  if (!diagnosis) notFound();
  // Destinataire : un recruteur rattaché à la candidature s'il y en a un.
  const { data: recruiter } = await supabase
    .from("application_contacts")
    .select("network_contact_id, user_network_contacts!inner(status, professional_contacts!inner(role_type))")
    .eq("application_id", id)
    .in("user_network_contacts.professional_contacts.role_type", ["recruiter", "hr"])
    .neq("user_network_contacts.status", "do_not_contact")
    .limit(1)
    .maybeSingle();
  const setup = await loadMessageSetup(supabase, { networkId: recruiter?.network_contact_id ?? null, applicationId: id, userId: user.id });
  if (!setup) notFound();

  const limitReached = diagnosis.followUpCount >= 2;
  return (
    <>
      <PageHeader
        title={`Relancer ${diagnosis.company}`}
        description={
          <>
            {diagnosis.jobTitle} —{" "}
            <Link href={`/candidatures/${id}`} className="font-medium text-emerald hover:underline">
              voir la candidature
            </Link>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <DiagnosisPanel d={diagnosis.diagnosis} />
        <Panel>
          <PanelHeader
            title="Message de relance"
            description={recruiter ? `Adressé à ${[setup.facts.recipient.firstName, setup.facts.recipient.lastName].filter(Boolean).join(" ")}, recruteur identifié.` : "Aucun recruteur identifié : le message est générique. Envoyez-le à l'adresse de l'offre ou au service recrutement."}
          />
          <PanelBody className="grid gap-4">
            {erreur === "limite" || limitReached ? (
              <Alert tone="info" title="Deux relances déjà envoyées">
                Une troisième relance risque de desservir votre candidature. Privilégiez un échange avec une personne de l&apos;équipe.
              </Alert>
            ) : (
              <MessageComposer
                kind="application"
                networkId={setup.networkId}
                applicationId={id}
                purposes={["application_follow_up"]}
                defaultPurpose="application_follow_up"
                allowedRecipients={["recruiter", "manager"]}
                defaultRecipient="recruiter"
                ctx={setup.ctx}
              />
            )}
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
