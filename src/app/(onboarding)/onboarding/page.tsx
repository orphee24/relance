import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { CvUploadForm } from "@/components/cv/upload-form";
import { StepIdentity, StepJob, StepLocation, StepPreferences } from "@/components/onboarding/step-forms";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_STEPS } from "@/lib/validation/onboarding";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "./actions";

export const metadata: Metadata = { title: "Bienvenue" };
export const dynamic = "force-dynamic";

const HEADINGS: Record<number, { title: string; text: string }> = {
  1: { title: "Comment vous appelez-vous ?", text: "Votre nom apparaîtra dans les messages que vous préparerez avec Relance." },
  2: { title: "Quel poste recherchez-vous ?", text: "Relance s'en sert pour évaluer les offres et repérer les personnes pertinentes." },
  3: { title: "Où souhaitez-vous travailler ?", text: "Ces critères affinent les recommandations. Vous pourrez les modifier à tout moment." },
  4: { title: "Vos préférences", text: "Tout est facultatif sur cette étape." },
  5: { title: "Importez votre CV", text: "Relance en extrait votre profil. Vous vérifiez chaque information avant qu'elle soit utilisée." },
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/onboarding");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select(
      "first_name, last_name, target_job, experience_level, experience_years, location, mobility, contract_types, sectors, desired_salary_min, desired_salary_max, available_from, onboarding_step, onboarding_completed_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const done = profile?.onboarding_step ?? 0;
  const requested = Number((await searchParams).etape);
  // On ne peut pas sauter les étapes obligatoires non remplies.
  const maxReachable = Math.min(5, done + 1);
  const step = Number.isInteger(requested) && requested >= 1 && requested <= maxReachable ? requested : maxReachable;
  const heading = HEADINGS[step]!;
  const defaults = profile ?? {};

  return (
    <div className="grid gap-8 pt-4 sm:pt-10">
      <div className="grid gap-4">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Étape {step} sur {ONBOARDING_STEPS.length}
          </span>
          {profile?.onboarding_completed_at ? null : <span>Environ 3 minutes</span>}
        </div>
        <Progress value={((step - 1) / ONBOARDING_STEPS.length) * 100} label={`Progression : étape ${step} sur 5`} />
        <ol className="hidden gap-2 sm:grid sm:grid-cols-5" aria-label="Étapes">
          {ONBOARDING_STEPS.map((s) => {
            const complete = s.step <= done;
            const current = s.step === step;
            return (
              <li key={s.step} aria-current={current ? "step" : undefined} className={cn("flex items-center gap-2 text-xs", current ? "font-medium text-ink" : "text-muted")}>
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums",
                    complete ? "border-emerald bg-emerald text-on-emerald" : current ? "border-emerald text-emerald" : "border-line-strong",
                  )}
                >
                  {complete ? <Check className="size-3" aria-label="terminée" /> : s.step}
                </span>
                {s.title}
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{heading.title}</h1>
        <p className="mt-1 max-w-prose text-muted">{heading.text}</p>
      </div>

      {step === 1 && <StepIdentity defaults={defaults} />}
      {step === 2 && <StepJob defaults={defaults} />}
      {step === 3 && <StepLocation defaults={defaults} />}
      {step === 4 && <StepPreferences defaults={defaults} />}
      {step === 5 && (
        <div className="grid gap-6">
          <CvUploadForm next="/onboarding/terminer" submitLabel="Importer mon CV" />
          <form action={completeOnboarding} className="flex items-center gap-3 border-t border-line pt-5 text-sm text-muted">
            <span>Pas de CV sous la main ?</span>
            <Button type="submit" variant="link">
              Terminer sans CV
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
