import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { StatusBadge } from "@/components/applications/status";
import { PageHeader } from "@/components/layout/page-header";
import { TeamPageExtractor } from "@/components/network/forms";
import { PersonCard } from "@/components/network/person-card";
import { SearchLinks } from "@/components/network/search-links";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { ApplicationStatus } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { normalizeCompanyName } from "@/lib/normalize";
import { loadNetworkList } from "@/server/network/load";

export const metadata: Metadata = { title: "Entreprise" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ candidature?: string }> }) {
  const { id } = await params;
  const { candidature } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: company } = await supabase.from("companies").select("id, name, domain, website_url").eq("id", id).maybeSingle();
  if (!company) notFound();
  const { data: apps } = await supabase
    .from("applications")
    .select("id, job_title, company_name, status")
    .eq("company_id", id)
    .order("created_at", { ascending: false });
  // Accès réservé aux entreprises liées aux données de l'utilisateur (le référentiel est partagé).
  if (!apps?.length) notFound();

  const displayName = apps[0]!.company_name;
  const key = normalizeCompanyName(displayName);
  const { people } = await loadNetworkList(supabase);
  const here = people.filter((p) => normalizeCompanyName(p.company) === key);
  const current = apps.find((a) => a.id === candidature) ?? apps[0]!;

  return (
    <>
      <PageHeader
        title={displayName}
        description={company.domain ? `Domaine officiel : ${company.domain}` : "Domaine officiel non identifié."}
        actions={
          <Button asChild>
            <Link href={`/reseau/nouveau?candidature=${current.id}`}>
              <UserPlus />
              Ajouter une personne
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Panel>
            <PanelHeader title={`Personnes identifiées (${here.length})`} description="Rapprochées par le nom d'entreprise déclaré. Le badge indique si le poste a été vérifié." />
            {here.length ? (
              <ul className="divide-y divide-line">
                {here.map((p) => (
                  <PersonCard key={p.networkId} p={p} mode="list" />
                ))}
              </ul>
            ) : (
              <PanelBody className="text-sm text-muted">Aucune personne de cette entreprise dans votre réseau pour le moment.</PanelBody>
            )}
          </Panel>

          <Panel id="page-equipe" className="scroll-mt-6">
            <PanelHeader title="Repérer les personnes d'une page « équipe »" description="Pour les pages publiées par l'entreprise elle-même." />
            <PanelBody>
              <TeamPageExtractor companyName={displayName} applicationId={current.id} />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel>
            <PanelHeader title="Vos candidatures" />
            <ul className="divide-y divide-line">
              {apps.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Link href={`/candidatures/${a.id}#personnes`} className="min-w-0 flex-1 truncate font-medium hover:text-emerald hover:underline">
                    {a.job_title}
                  </Link>
                  <StatusBadge status={a.status as ApplicationStatus} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Recherche assistée" description={`Pour le poste « ${current.job_title} ».`} />
            <PanelBody>
              <SearchLinks company={displayName} jobTitle={current.job_title} domain={company.domain} />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
