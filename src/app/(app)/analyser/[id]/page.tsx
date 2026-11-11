import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { AnalysisView } from "@/components/offers/analysis-view";
import { Alert } from "@/components/ui/misc";
import { storedAnalysisSchema } from "@/lib/validation/offer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analyse de l'offre" };

export default async function OfferAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ adaptee?: string; avant?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: offer } = await supabase
    .from("job_offers")
    .select("id, title, company_name, url, location, salary_text, contract_type, extracted")
    .eq("id", id)
    .maybeSingle();
  if (!offer) notFound();

  const parsed = storedAnalysisSchema.safeParse(offer.extracted);
  if (!parsed.success) {
    return (
      <>
        <PageHeader title={offer.title} description={offer.company_name} />
        <Alert tone="danger">Cette analyse n&apos;a pas pu être lue. Supprimez-la et relancez l&apos;analyse.</Alert>
      </>
    );
  }
  return <AnalysisView offer={offer} analysis={parsed.data} sp={sp} />;
}
