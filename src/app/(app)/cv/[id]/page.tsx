import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, FileText, Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/ui/confidence";
import { Alert, Badge } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { resumeProfileSchema } from "@/lib/validation/resume-profile";
import { isQuantified } from "@/server/cv/heuristic-parser";

export const metadata: Metadata = { title: "Mon CV" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { version: justSaved } = await searchParams;

  const supabase = await createClient();
  const [{ data: resume }, { data: versions }] = await Promise.all([
    supabase.from("resumes").select("id, title, original_filename, is_primary, user_verified_at, created_at").eq("id", id).maybeSingle(),
    supabase.from("resume_versions").select("id, version_no, label, content, created_at").eq("resume_id", id).order("version_no", { ascending: false }),
  ]);
  if (!resume) notFound();
  if (!versions?.length) redirect(`/cv/${id}/verifier`);

  const latest = versions[0]!;
  const parsed = resumeProfileSchema.safeParse(latest.content);
  const profile = parsed.success ? parsed.data : null;
  const achievements = profile?.experiences.flatMap((x) => x.achievements) ?? [];
  const quantified = achievements.filter(isQuantified).length;

  return (
    <>
      <PageHeader
        title={resume.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ConfidenceBadge level="verified" label="Profil vérifié par vous" />
            {resume.is_primary ? <Badge tone="emerald">CV principal</Badge> : null}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={`/cv/${id}/verifier`}>
                <Pencil />
                Modifier
              </Link>
            </Button>
            <Button asChild>
              <a href={`/api/cv/versions/${latest.id}/pdf`}>
                <Download />
                Exporter en PDF
              </a>
            </Button>
          </>
        }
      />

      <div className="grid gap-4">
        {justSaved ? <Alert tone="success">Version {justSaved} enregistrée.</Alert> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {profile ? (
            <Panel>
              <PanelHeader title={profile.identity.fullName ?? "Profil"} description={profile.identity.headline ?? undefined} />
              <PanelBody className="grid gap-6 text-sm">
                {profile.experiences.length ? (
                  <section className="grid gap-4">
                    <h3 className="font-semibold">Expérience</h3>
                    {profile.experiences.map((x, i) => (
                      <div key={i}>
                        <p className="font-medium">{[x.title, x.company].filter(Boolean).join(" — ")}</p>
                        <p className="text-muted">{[x.startDate, x.isCurrent ? "aujourd'hui" : x.endDate].filter(Boolean).join(" – ")}</p>
                        {x.achievements.length ? (
                          <ul className="mt-1.5 grid list-disc gap-1 pl-5">
                            {x.achievements.map((a, j) => (
                              <li key={j}>{a}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </section>
                ) : null}
                {profile.skills.length ? (
                  <section className="grid gap-2">
                    <h3 className="font-semibold">Compétences</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {profile.skills.map((s) => (
                        <li key={s.name}>
                          <Badge>{s.name}</Badge>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {profile.education.length ? (
                  <section className="grid gap-2">
                    <h3 className="font-semibold">Formation</h3>
                    {profile.education.map((e, i) => (
                      <p key={i}>
                        {[e.degree, e.institution, e.year].filter(Boolean).join(" — ")}
                      </p>
                    ))}
                  </section>
                ) : null}
                {profile.languages.length ? (
                  <section className="grid gap-2">
                    <h3 className="font-semibold">Langues</h3>
                    <p>{profile.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(", ")}</p>
                  </section>
                ) : null}
              </PanelBody>
            </Panel>
          ) : (
            <Alert tone="danger">Cette version n&apos;a pas pu être lue.</Alert>
          )}

          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title="En un coup d'œil" />
              <PanelBody>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <Stat label="Expériences" value={profile?.experiences.length ?? 0} />
                  <Stat label="Compétences" value={profile?.skills.length ?? 0} />
                  <Stat label="Réalisations" value={achievements.length} />
                  <Stat label="dont chiffrées" value={quantified} />
                </dl>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title={`Versions (${versions.length})`} />
              <ul className="divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{v.label ?? `Version ${v.version_no}`}</p>
                      <p className="text-xs text-muted">{dateFmt.format(new Date(v.created_at))}</p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/api/cv/versions/${v.id}/pdf`} aria-label={`Exporter ${v.label ?? `la version ${v.version_no}`} en PDF`}>
                        <Download />
                        PDF
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelBody className="flex items-center gap-3 text-sm">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-muted">{resume.original_filename ?? "Fichier d'origine"}</span>
                <a href={`/api/cv/${id}/original`} className="shrink-0 font-medium text-emerald hover:underline">
                  Télécharger l&apos;original
                </a>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
