import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { StatusBadge } from "@/components/applications/status";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { ApplicationStatus } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { hasInterviewCoach } from "@/server/interview/access";

export const metadata: Metadata = { title: "Mes entretiens" };

const INTERVIEW: ApplicationStatus[] = ["interview_scheduled", "interview_done", "offer_received"];

export default async function InterviewsPage() {
  const supabase = await createClient();
  const allowed = await hasInterviewCoach(supabase);
  const { data: apps } = await supabase
    .from("applications")
    .select("id, company_name, job_title, status, next_action_at")
    .is("archived_at", null)
    .not("status", "in", "(rejected,withdrawn,accepted)")
    .order("updated_at", { ascending: false })
    .limit(100);
  const list = (apps ?? []).sort((a, b) => Number(INTERVIEW.includes(b.status as ApplicationStatus)) - Number(INTERVIEW.includes(a.status as ApplicationStatus)));

  if (!allowed) {
    return (
      <>
        <PageHeader title="Mes entretiens" description="Préparez vos entretiens à partir de l'offre et de votre CV vérifié." />
        <Panel className="max-w-2xl">
          <PanelBody className="grid gap-4">
            <p className="font-medium">Le coach d&apos;entretien est inclus dans le forfait Premium.</p>
            <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
              <li>Questions probables tirées des critères de l&apos;offre</li>
              <li>Préparation de vos réponses avec la méthode STAR, à partir de vos réalisations réelles</li>
              <li>Façon honnête d&apos;aborder un critère que vous ne remplissez pas</li>
              <li>Questions à poser et repères pour la négociation salariale</li>
            </ul>
            <Button asChild className="justify-self-start">
              <Link href="/parametres/forfait">Voir les forfaits</Link>
            </Button>
          </PanelBody>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mes entretiens" description="Choisissez une candidature pour préparer l'entretien. Les entretiens programmés apparaissent en premier." />
      <Panel>
        <PanelHeader title="Candidatures" />
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id}>
                <Link href={`/entretiens/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-sunken">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-medium">{a.job_title}</span>
                    <span className="block text-sm text-muted">{a.company_name}</span>
                  </span>
                  <StatusBadge status={a.status as ApplicationStatus} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <PanelBody>
            <EmptyState icon={MessagesSquare} title="Aucune candidature active." description="Ajoutez une candidature pour préparer son entretien." />
          </PanelBody>
        )}
      </Panel>
    </>
  );
}
