import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Nouvelle candidature" };

export default function NewApplicationPage() {
  return (
    <>
      <PageHeader
        title="Nouvelle candidature"
        description={
          <>
            Pour obtenir un score de couverture et des suggestions,{" "}
            <Link href="/analyser" className="font-medium text-emerald hover:underline">
              analysez d&apos;abord l&apos;offre
            </Link>
            , puis suivez-la en un clic.
          </>
        }
      />
      <Panel className="max-w-3xl">
        <PanelBody>
          <ApplicationForm mode="create" />
        </PanelBody>
      </Panel>
    </>
  );
}
