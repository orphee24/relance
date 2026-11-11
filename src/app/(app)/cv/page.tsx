import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Star } from "lucide-react";
import { CvUploadForm } from "@/components/cv/upload-form";
import { DeleteResumeButton } from "@/components/cv/delete-resume";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/ui/confidence";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { setPrimaryResume } from "./actions";

export const metadata: Metadata = { title: "Mes CV" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function ResumesPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const { supprime } = await searchParams;
  const supabase = await createClient();
  const { data: resumes, error } = await supabase
    .from("resumes")
    .select("id, title, is_primary, user_verified_at, created_at, resume_versions(count)")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Mes CV" description="Votre profil professionnel et les versions de votre CV. Relance n'utilise que les informations que vous avez vérifiées." />
      <div className="grid gap-4">
        {supprime ? <Alert tone="success">Le CV a été supprimé.</Alert> : null}
        {error ? <Alert tone="danger">Vos CV n&apos;ont pas pu être chargés. Rechargez la page.</Alert> : null}

        <Panel>
          <PanelHeader title={`Mes CV (${resumes?.length ?? 0})`} />
          {resumes && resumes.length > 0 ? (
            <ul className="divide-y divide-line">
              {resumes.map((r) => {
                const versionCount = Array.isArray(r.resume_versions) ? (r.resume_versions[0]?.count ?? 0) : 0;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                    <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1 basis-48">
                      <Link href={`/cv/${r.id}`} className="font-medium hover:text-emerald hover:underline">
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted">
                        Importé le {dateFmt.format(new Date(r.created_at))}
                        {versionCount ? ` · ${versionCount} version${versionCount > 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.is_primary ? <Badge tone="emerald">Principal</Badge> : null}
                      {r.user_verified_at ? (
                        <ConfidenceBadge level="verified" />
                      ) : (
                        <ConfidenceBadge level="inferred" label="À vérifier" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {!r.user_verified_at ? (
                        <Button size="sm" asChild>
                          <Link href={`/cv/${r.id}/verifier`}>Vérifier</Link>
                        </Button>
                      ) : null}
                      {!r.is_primary ? (
                        <form action={setPrimaryResume}>
                          <input type="hidden" name="resumeId" value={r.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            <Star />
                            Définir comme principal
                          </Button>
                        </form>
                      ) : null}
                      <DeleteResumeButton resumeId={r.id} title={r.title} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PanelBody>
              <EmptyState
                icon={FileText}
                title="Aucun CV pour le moment."
                description="Importez votre CV : Relance en extrait votre profil, que vous vérifiez avant tout usage."
              />
            </PanelBody>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Importer un CV" description="Un CV par variante de profil : par exemple une version en anglais, ou orientée management." />
          <PanelBody>
            <CvUploadForm />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
