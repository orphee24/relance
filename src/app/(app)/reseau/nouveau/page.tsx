import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ContactForm } from "@/components/network/forms";
import { Panel, PanelBody } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ajouter une personne" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ candidature?: string }> }) {
  const { candidature } = await searchParams;
  const supabase = await createClient();
  const app = candidature && /^[0-9a-f-]{36}$/i.test(candidature)
    ? (await supabase.from("applications").select("id, company_name, job_title").eq("id", candidature).maybeSingle()).data
    : null;

  return (
    <>
      <PageHeader
        title="Ajouter une personne"
        description={
          app ? (
            <>
              Pour la candidature{" "}
              <Link href={`/candidatures/${app.id}`} className="font-medium text-emerald hover:underline">
                {app.job_title} — {app.company_name}
              </Link>
              . Saisissez ce que vous avez constaté sur son profil ou sur une page officielle.
            </>
          ) : (
            "Saisissez ce que vous avez constaté sur son profil ou sur une page officielle."
          )
        }
      />
      <Panel className="max-w-3xl">
        <PanelBody>
          <ContactForm applicationId={app?.id ?? null} companyName={app?.company_name ?? null} />
        </PanelBody>
      </Panel>
    </>
  );
}
