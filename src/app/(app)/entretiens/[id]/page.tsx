import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, Badge } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { createClient } from "@/lib/supabase/server";
import { storedAnalysisSchema } from "@/lib/validation/offer";
import { hasInterviewCoach } from "@/server/interview/access";
import { buildInterviewPrep, type StarAnswer } from "@/server/interview/prep";
import { StarForm } from "../star-form";

export const metadata: Metadata = { title: "Préparer l'entretien" };

const KIND_LABEL = { classic: "Question classique", requirement: "Critère de l'offre", gap: "Critère non démontré" } as const;

export default async function InterviewPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  if (!(await hasInterviewCoach(supabase))) redirect("/entretiens");

  const [{ data: app }, { data: profile }, { data: session }] = await Promise.all([
    supabase.from("applications").select("id, company_name, job_title, salary_text, job_offers(extracted, salary_text)").eq("id", id).maybeSingle(),
    supabase.from("user_profiles").select("desired_salary_min, desired_salary_max").eq("id", user.id).maybeSingle(),
    supabase.from("interview_sessions").select("prep").eq("application_id", id).eq("mode", "text").maybeSingle(),
  ]);
  if (!app) notFound();
  const offer = (Array.isArray(app.job_offers) ? app.job_offers[0] : app.job_offers) as { extracted: unknown; salary_text: string | null } | null;
  const analysis = storedAnalysisSchema.safeParse(offer?.extracted);
  const prep = buildInterviewPrep({
    company: app.company_name,
    jobTitle: app.job_title,
    requirements: analysis.success ? analysis.data.requirements : [],
    desiredSalary: { min: profile?.desired_salary_min ?? null, max: profile?.desired_salary_max ?? null },
    offerSalary: app.salary_text ?? offer?.salary_text ?? null,
  });
  const answers = ((session?.prep as { answers?: Record<string, StarAnswer> } | null)?.answers ?? {}) as Record<string, StarAnswer>;
  const done = prep.questions.filter((q) => answers[q.id]).length;

  return (
    <>
      <PageHeader
        title={`Entretien ${app.company_name}`}
        description={
          <>
            {app.job_title} —{" "}
            <Link href={`/candidatures/${id}`} className="font-medium text-emerald hover:underline">
              voir la candidature
            </Link>
          </>
        }
      />
      <div className="grid gap-4">
        {!analysis.success ? (
          <Alert tone="info" title="Offre non analysée">
            Seules les questions classiques sont proposées. <Link href="/analyser" className="font-medium text-emerald hover:underline">Analysez l&apos;offre</Link> pour
            obtenir des questions sur ses critères.
          </Alert>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Questions probables" description={`${done} réponse${done > 1 ? "s" : ""} préparée${done > 1 ? "s" : ""} sur ${prep.questions.length}.`} />
            <ol className="divide-y divide-line">
              {prep.questions.map((q) => (
                <li key={q.id}>
                  <details className="group" open={q.kind === "gap"}>
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 hover:bg-sunken">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{q.text}</span>
                        <span className="mt-1 flex flex-wrap gap-2">
                          <Badge tone={q.kind === "gap" ? "danger" : "neutral"}>{KIND_LABEL[q.kind]}</Badge>
                          {answers[q.id] ? <Badge tone="emerald">Préparée</Badge> : null}
                        </span>
                      </span>
                    </summary>
                    <div className="grid gap-3 px-5 pb-5">
                      <p className="text-sm text-muted">{q.hint}</p>
                      {q.evidence ? <blockquote className="border-l-2 border-emerald/50 pl-3 text-sm">Dans votre CV : « {q.evidence} »</blockquote> : null}
                      <StarForm applicationId={id} questionId={q.id} initial={answers[q.id] ?? null} evidence={q.evidence} />
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </Panel>
          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title="Questions à poser" />
              <PanelBody>
                <ul className="grid list-disc gap-1.5 pl-5 text-sm">
                  {prep.questionsToAsk.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelHeader title="Rémunération" />
              <PanelBody className="grid gap-2 text-sm">
                <p>
                  <span className="text-muted">Annoncée dans l&apos;offre : </span>
                  {prep.salary.offer ?? "non précisée"}
                </p>
                <p>
                  <span className="text-muted">Votre fourchette : </span>
                  {prep.salary.desired ?? (
                    <Link href="/onboarding?etape=4" className="font-medium text-emerald hover:underline">
                      à renseigner
                    </Link>
                  )}
                </p>
                <p className="text-muted">{prep.salary.advice}</p>
              </PanelBody>
            </Panel>
            <Panel>
              <PanelBody className="text-sm text-muted">La simulation d&apos;entretien avec retours personnalisés sera disponible avec l&apos;IA.</PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
