import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ResumeReviewForm } from "@/components/cv/review-form";
import { PageHeader } from "@/components/layout/page-header";
import { ConfidenceBadge, ConfidenceMark } from "@/components/ui/confidence";
import { Alert } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { resumeProfileSchema, storedParseSchema } from "@/lib/validation/resume-profile";
import { safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Vérifier mon CV" };

export default async function VerifyResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ suite?: string }>;
}) {
  const { id } = await params;
  const { suite } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: resume }, { data: latest }] = await Promise.all([
    supabase.from("resumes").select("id, title, parsed_profile, user_verified_at").eq("id", id).maybeSingle(),
    supabase.from("resume_versions").select("version_no, content").eq("resume_id", id).order("version_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!resume) notFound();

  const stored = storedParseSchema.safeParse(resume.parsed_profile);
  // Si une version validée existe, on repart d'elle ; sinon de l'extraction.
  const fromVersion = latest ? resumeProfileSchema.safeParse(latest.content) : null;
  const initial = fromVersion?.success ? fromVersion.data : stored.success ? stored.data.profile : null;
  const parse = stored.success ? stored.data : null;
  const next = suite ? safeRedirectPath(suite) : undefined;

  return (
    <>
      <PageHeader
        title={latest ? "Modifier mon profil" : "Vérifiez votre profil"}
        description={
          latest
            ? `Vous partez de la version ${latest.version_no}. Une nouvelle version sera créée ; les précédentes restent disponibles.`
            : "Relance a extrait ces informations de votre CV. Corrigez, retirez ou complétez : rien n'est utilisé avant votre validation."
        }
        actions={
          <Link href={`/cv/${id}`} className="text-sm font-medium text-emerald hover:underline">
            Annuler
          </Link>
        }
      />

      <div className="grid gap-4">
        {!latest && parse ? (
          <Panel>
            <PanelHeader title="Ce qu'il faut savoir sur cette extraction" />
            <PanelBody className="grid gap-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <ConfidenceBadge level="inferred" label="À vérifier" />
                <span className="text-muted">
                  {parse.source === "ai"
                    ? "Extraction assistée par IA. Chaque élément conservé a été retrouvé tel quel dans votre CV."
                    : "Extraction automatique sans IA, à partir de la structure de votre CV. Elle peut manquer des éléments sur les mises en page complexes."}
                </span>
              </div>
              {parse.rejectedUngrounded > 0 ? (
                <p className="text-muted">
                  {parse.rejectedUngrounded} élément(s) proposé(s) ont été écartés car ils ne figuraient pas dans votre CV.
                </p>
              ) : null}
              {parse.ignoredLines.length > 0 ? (
                <Alert tone="info" title="Des lignes de votre CV ont été ignorées">
                  <span className="inline-flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Elles ressemblaient à des consignes adressées à un logiciel d&apos;IA et n&apos;ont pas été prises en compte. Certains recruteurs
                    considèrent ces pratiques comme une manipulation : nous vous conseillons de les retirer du CV.
                  </span>
                </Alert>
              ) : null}
              {parse.gaps.length > 0 ? (
                <div>
                  <p className="font-medium">Informations manquantes ou à renforcer</p>
                  <ul className="mt-2 grid gap-1.5">
                    {parse.gaps.map((g) => (
                      <li key={g.key} className="flex items-start gap-2 text-muted">
                        <ConfidenceMark level="unknown" className="mt-1" />
                        {g.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        ) : null}

        {initial ? (
          <ResumeReviewForm
            resumeId={id}
            initial={initial}
            next={next}
            defaultLabel={latest ? `Version ${latest.version_no + 1}` : "Version 1"}
          />
        ) : (
          <Alert tone="danger" title="Ce CV n'a pas pu être analysé.">
            Supprimez-le et importez-le à nouveau.
          </Alert>
        )}
      </div>
    </>
  );
}
