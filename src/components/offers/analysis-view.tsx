import Link from "next/link";
import { ExternalLink, FileText, ListChecks, ShieldAlert, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CoverageBadge, CoverageGauge, CoverageMark } from "@/components/offers/coverage";
import { SuggestionCard } from "@/components/offers/suggestion-card";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { CONTRACT_TYPES } from "@/lib/validation/onboarding";
import type { RequirementResult, StoredAnalysis } from "@/lib/validation/offer";
import { createAdaptedVersion, deleteOffer } from "@/app/(app)/analyser/actions";
import { trackOffer } from "@/app/(app)/candidatures/actions";

const CATEGORY_LABELS: Record<RequirementResult["category"], string> = {
  skill: "Compétence",
  tool: "Outil",
  experience: "Expérience",
  education: "Formation",
  language: "Langue",
  certification: "Certification",
  soft_skill: "Qualité",
  other: "Autre",
};

export interface OfferSummary {
  id: string;
  title: string;
  company_name: string;
  url: string | null;
  location: string | null;
  salary_text: string | null;
  contract_type: string | null;
}

export function AnalysisView({
  offer,
  analysis,
  sp,
  applicationId = null,
}: {
  offer: OfferSummary;
  analysis: StoredAnalysis;
  sp: { adaptee?: string; avant?: string; erreur?: string };
  applicationId?: string | null;
}) {
  const a = analysis;
  const mandatory = a.requirements.filter((r) => r.kind === "mandatory");
  const preferred = a.requirements.filter((r) => r.kind === "preferred");
  const count = (rs: RequirementResult[], s: RequirementResult["coverage"]) => rs.filter((r) => r.coverage === s).length;
  const missingMandatory = mandatory.filter((r) => r.coverage === "missing" || r.coverage === "unknown");
  const accepted = a.suggestions.filter((s) => s.status === "accepted").length;
  const actionable = a.suggestions.filter((s) => s.type !== "information");
  const information = a.suggestions.filter((s) => s.type === "information");
  const contract = offer.contract_type && offer.contract_type in CONTRACT_TYPES ? CONTRACT_TYPES[offer.contract_type as keyof typeof CONTRACT_TYPES] : null;

  return (
    <>
      <PageHeader
        title={offer.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-ink">{offer.company_name}</span>
            {[offer.location, contract, offer.salary_text].filter(Boolean).map((m) => (
              <span key={m}>{m}</span>
            ))}
          </span>
        }
        actions={
          <>
            {offer.url ? (
              <Button variant="secondary" asChild>
                <a href={offer.url} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink />
                  Voir l&apos;offre
                </a>
              </Button>
            ) : null}
            {applicationId ? (
              <Button variant="secondary" asChild>
                <Link href={`/candidatures/${applicationId}`}>
                  <ListChecks />
                  Voir la candidature
                </Link>
              </Button>
            ) : (
              <form action={trackOffer}>
                <input type="hidden" name="offerId" value={offer.id} />
                <SubmitButton pendingLabel="Ajout…" className="w-auto">
                  <ListChecks />
                  Suivre cette candidature
                </SubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-4">
        {sp.adaptee ? (
          <Alert tone="success" title="Version adaptée créée.">
            {sp.adaptee} modification{Number(sp.adaptee) > 1 ? "s" : ""} appliquée{Number(sp.adaptee) > 1 ? "s" : ""}.
            {sp.avant && a.score != null ? ` Couverture : ${Math.round(Number(sp.avant))} % → ${Math.round(a.score)} %.` : ""} Votre CV d&apos;origine reste inchangé.
          </Alert>
        ) : null}
        {sp.erreur === "limite" ? (
          <Alert tone="danger">Vous suivez déjà le nombre maximal de candidatures de votre forfait. Archivez une candidature terminée pour suivre celle-ci.</Alert>
        ) : sp.erreur === "suivi" ? (
          <Alert tone="danger">La candidature n&apos;a pas pu être créée. Réessayez.</Alert>
        ) : sp.erreur ? (
          <Alert tone="danger">La version adaptée n&apos;a pas pu être créée. Réessayez.</Alert>
        ) : null}
        {a.ignoredLines.length > 0 ? (
          <Alert tone="info" title="Une partie du texte de l'offre a été ignorée">
            <span className="inline-flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {a.ignoredLines.length} ligne(s) ressemblaient à des consignes adressées à un logiciel d&apos;IA et n&apos;ont pas été analysées.
            </span>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Panel className="self-start">
            <PanelHeader title="Couverture estimée" />
            <PanelBody className="grid gap-5">
              {a.score != null ? (
                <>
                  <CoverageGauge score={a.score} />
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted">Obligatoires</dt>
                      <dd className="mt-0.5 tabular-nums">
                        <span className="font-semibold">{count(mandatory, "demonstrated")}</span> / {mandatory.length} démontrés
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Souhaités</dt>
                      <dd className="mt-0.5 tabular-nums">
                        <span className="font-semibold">{count(preferred, "demonstrated")}</span> / {preferred.length} démontrés
                      </dd>
                    </div>
                  </dl>
                  {missingMandatory.length > 0 ? (
                    <p className="text-sm">
                      <span className="font-medium">{missingMandatory.length} critère{missingMandatory.length > 1 ? "s" : ""} obligatoire{missingMandatory.length > 1 ? "s" : ""}</span>{" "}
                      non démontré{missingMandatory.length > 1 ? "s" : ""} par votre CV.
                    </p>
                  ) : null}
                </>
              ) : (
                <Alert tone="info" title="Pas de score sans CV vérifié">
                  <Link href="/cv" className="font-medium text-emerald hover:underline">
                    Importez et vérifiez votre CV
                  </Link>{" "}
                  pour comparer.
                </Alert>
              )}
              <div className="grid gap-2 border-t border-line pt-4 text-xs text-muted">
                <p>
                  Estimation calculée par Relance à partir de votre CV vérifié : les critères obligatoires comptent trois fois, les
                  souhaités une fois, un critère partiel à moitié. Ce n&apos;est pas le score du logiciel de recrutement de
                  l&apos;entreprise, et il ne garantit ni sélection ni entretien.
                </p>
                {a.resumeVersionLabel ? (
                  <p className="flex items-center gap-1.5">
                    <FileText className="size-3.5" aria-hidden="true" />
                    Comparé à : {a.resumeVersionLabel}
                  </p>
                ) : null}
                <p>
                  Critères extraits {a.extractionSource === "ai" ? "par IA" : "automatiquement, sans IA"} ; comparaison{" "}
                  {a.matchingSource === "ai" ? "affinée par IA" : "automatique, sans IA"}.
                  {a.rejectedUngrounded > 0 ? ` ${a.rejectedUngrounded} proposition(s) écartée(s) faute de preuve.` : ""}
                </p>
              </div>
            </PanelBody>
          </Panel>

          <div className="grid content-start gap-4">
            <RequirementsPanel title="Critères obligatoires" items={mandatory} />
            {preferred.length > 0 ? <RequirementsPanel title="Critères souhaités" items={preferred} /> : null}
          </div>
        </div>

        {actionable.length > 0 || information.length > 0 ? (
          <Panel>
            <PanelHeader
              title="Améliorer votre CV pour cette offre"
              description="Chaque proposition s'appuie sur votre CV ou sur ce que vous déclarez. Rien n'est appliqué sans votre accord, et votre CV d'origine reste intact."
            />
            <ul className="divide-y divide-line">
              {[...actionable, ...information].map((s) => (
                <SuggestionCard key={s.id} offerId={offer.id} suggestion={s} />
              ))}
            </ul>
            {actionable.length > 0 ? (
              <PanelBody className="flex flex-wrap items-center gap-3 border-t border-line">
                <form action={createAdaptedVersion}>
                  <input type="hidden" name="offerId" value={offer.id} />
                  <SubmitButton pendingLabel="Création de la version…" disabled={accepted === 0} className="w-auto">
                    <Sparkles />
                    Créer une version adaptée ({accepted})
                  </SubmitButton>
                </form>
                <p className="text-sm text-muted">
                  {accepted === 0 ? "Acceptez au moins une proposition." : "Une nouvelle version de votre CV sera créée, puis l'offre réanalysée."}
                </p>
              </PanelBody>
            ) : null}
          </Panel>
        ) : null}

        <form action={deleteOffer} className="justify-self-start">
          <input type="hidden" name="offerId" value={offer.id} />
          <Button type="submit" variant="ghost" size="sm">
            Supprimer cette analyse
          </Button>
        </form>
      </div>
    </>
  );
}

function RequirementsPanel({ title, items }: { title: string; items: RequirementResult[] }) {
  return (
    <Panel>
      <PanelHeader title={`${title} (${items.length})`} />
      {items.length === 0 ? (
        <PanelBody className="text-sm text-muted">Aucun critère de ce type n&apos;a été identifié dans l&apos;offre.</PanelBody>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((r, i) => (
            <li key={`${r.label}-${i}`} className="grid gap-1.5 px-5 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <p className="min-w-0 flex-1 basis-60 font-medium">{r.label}</p>
                <div className="flex items-center gap-2">
                  <Badge>{CATEGORY_LABELS[r.category]}</Badge>
                  <CoverageBadge state={r.coverage} />
                </div>
              </div>
              <p className="text-sm text-muted">{r.explanation}</p>
              {r.resumeEvidence || r.offerEvidence !== r.label ? (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer select-none hover:text-ink">Voir les extraits</summary>
                  <dl className="mt-2 grid gap-2">
                    <div className="grid gap-0.5">
                      <dt className="font-medium text-ink">Dans l&apos;offre</dt>
                      <dd className="border-l-2 border-line-strong pl-3">{r.offerEvidence}</dd>
                    </div>
                    {r.resumeEvidence ? (
                      <div className="grid gap-0.5">
                        <dt className="flex items-center gap-1.5 font-medium text-ink">
                          <CoverageMark state={r.coverage} className="size-2.5" />
                          Dans votre CV
                        </dt>
                        <dd className="whitespace-pre-line border-l-2 border-emerald/50 pl-3">{r.resumeEvidence}</dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
