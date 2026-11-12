import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { normalizeCompanyName } from "@/lib/normalize";

export const metadata: Metadata = { title: "Explorer les entreprises" };

interface CompanyEntry {
  id: string;
  name: string;
  domain: string | null;
  applications: number;
  people: number;
}

export default async function CompaniesPage() {
  const supabase = await createClient();
  const [{ data: apps, error }, { data: contacts }] = await Promise.all([
    supabase.from("applications").select("company_id, company_name, companies(id, name, domain)").is("archived_at", null).not("company_id", "is", null).limit(1000),
    supabase.from("professional_contacts").select("company_name").not("company_name", "is", null).limit(5000),
  ]);

  const peopleByName = new Map<string, number>();
  for (const c of contacts ?? []) {
    const k = normalizeCompanyName(c.company_name);
    if (k) peopleByName.set(k, (peopleByName.get(k) ?? 0) + 1);
  }
  const map = new Map<string, CompanyEntry>();
  for (const a of apps ?? []) {
    const co = Array.isArray(a.companies) ? a.companies[0] : a.companies;
    if (!co) continue;
    const entry = map.get(co.id) ?? { id: co.id, name: a.company_name, domain: co.domain, applications: 0, people: peopleByName.get(normalizeCompanyName(a.company_name) ?? "") ?? 0 };
    entry.applications++;
    map.set(co.id, entry);
  }
  const companies = [...map.values()].sort((a, b) => b.applications - a.applications || a.name.localeCompare(b.name, "fr"));

  return (
    <>
      <PageHeader title="Explorer les entreprises" description="Les entreprises de vos candidatures en cours, et les personnes que vous y avez identifiées." />
      <div className="grid gap-4">
        {error ? <Alert tone="danger">Les entreprises n&apos;ont pas pu être chargées.</Alert> : null}
        <Panel>
          {companies.length ? (
            <ul className="divide-y divide-line">
              {companies.map((c) => (
                <li key={c.id}>
                  <Link href={`/entreprises/${c.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 transition-colors hover:bg-sunken">
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block font-medium">{c.name}</span>
                      {c.domain ? <span className="block text-xs text-muted">{c.domain}</span> : null}
                    </span>
                    <span className="text-sm tabular-nums text-muted">
                      {c.applications} candidature{c.applications > 1 ? "s" : ""}
                    </span>
                    <span className="w-28 text-sm tabular-nums text-muted">
                      {c.people} personne{c.people > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <PanelBody>
              <EmptyState
                icon={Building2}
                title="Aucune entreprise pour le moment."
                description="Les entreprises apparaissent ici dès que vous suivez une candidature."
                action={
                  <Link href="/candidatures/nouvelle" className="text-sm font-medium text-emerald hover:underline">
                    Ajouter une candidature
                  </Link>
                }
              />
            </PanelBody>
          )}
        </Panel>
      </div>
    </>
  );
}
