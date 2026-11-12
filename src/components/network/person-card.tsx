import Link from "next/link";
import { ExternalLink, Link2Off, MessageSquareText, Plus } from "lucide-react";
import { linkToApplication, unlinkFromApplication } from "@/app/(app)/reseau/actions";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge, ConfidenceMark } from "@/components/ui/confidence";
import { Badge } from "@/components/ui/misc";
import { NETWORK_CONTACT_STATUS_LABELS } from "@/config/domain";
import { PROVIDER_LABELS } from "@/lib/validation/network";
import type { PersonView } from "@/server/network/load";
import { STRATEGIES } from "@/server/network/engine";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const STALE_DAYS = 180;

export function VerificationBadge({ p }: { p: Pick<PersonView, "confidence" | "lastVerifiedAt"> }) {
  if (p.confidence === "verified" && p.lastVerifiedAt) {
    const age = (Date.now() - new Date(p.lastVerifiedAt).getTime()) / 864e5;
    if (age > STALE_DAYS) return <ConfidenceBadge level="inferred" label={`Vérifié le ${dateFmt.format(new Date(p.lastVerifiedAt))}, à revérifier`} />;
    return <ConfidenceBadge level="verified" label={`Poste vérifié le ${dateFmt.format(new Date(p.lastVerifiedAt))}`} />;
  }
  return <ConfidenceBadge level={p.confidence === "unknown" ? "unknown" : "inferred"} label="Poste non vérifié" />;
}

export function ScoreBreakdown({ p }: { p: PersonView }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer select-none text-muted hover:text-ink">
        Pertinence {p.relevance.score}/100{p.relevance.unknownCount ? ` · ${p.relevance.unknownCount} critère${p.relevance.unknownCount > 1 ? "s" : ""} inconnu${p.relevance.unknownCount > 1 ? "s" : ""}` : ""}
      </summary>
      <dl className="mt-2 grid gap-1.5">
        {p.relevance.criteria.map((c) => (
          <div key={c.key} className="grid grid-cols-[1rem_minmax(0,1fr)_3.5rem] items-start gap-2">
            <ConfidenceMark level={c.known ? "verified" : "unknown"} className="mt-1" />
            <div>
              <dt className="font-medium">{c.label}</dt>
              <dd className="text-muted">{c.known ? c.reason : "Information inconnue : non comptée."}</dd>
            </div>
            <span className="text-right tabular-nums text-muted">
              {c.points.toLocaleString("fr-FR")} / {c.weight}
            </span>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-faint">Mesure la pertinence pour une prise de contact, pas une probabilité de recommandation.</p>
    </details>
  );
}

export function PersonCard({ p, applicationId, mode }: { p: PersonView; applicationId?: string; mode: "linked" | "suggestion" | "list" }) {
  const dnc = p.status === "do_not_contact";
  return (
    <li className={cn("grid gap-2.5 px-5 py-4", dnc && "opacity-60")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <Link href={`/reseau/${p.networkId}`} className="font-medium hover:text-emerald hover:underline">
            {p.name}
          </Link>
          <p className="text-sm text-muted">{[p.title, p.company].filter(Boolean).join(" · ") || "Fonction non renseignée"}</p>
        </div>
        {mode !== "list" ? (
          <span className="text-2xl font-semibold tabular-nums leading-none" aria-label={`Pertinence ${p.relevance.score} sur 100`}>
            {p.relevance.score}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge p={p} />
        {mode !== "list" && ["peer", "manager", "recruiter", "hr"].includes(p.roleType) ? <Badge>{STRATEGIES[p.strategy].label}</Badge> : null}
        <Badge tone={dnc ? "danger" : "neutral"}>{NETWORK_CONTACT_STATUS_LABELS[p.status]}</Badge>
        {p.hasMutual ? <Badge tone="emerald">Connexion commune</Badge> : null}
        <span className="text-xs text-faint">{p.providers.map((pr) => PROVIDER_LABELS[pr] ?? pr).join(", ")}</span>
      </div>
      {mode !== "list" ? <ScoreBreakdown p={p} /> : null}
      <div className="flex flex-wrap gap-2">
        {mode === "linked" && !dnc ? (
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/reseau/${p.networkId}/message${applicationId ? `?candidature=${applicationId}` : ""}`}>
              <MessageSquareText />
              Préparer un message
            </Link>
          </Button>
        ) : null}
        {p.profileUrl ? (
          <Button variant="ghost" size="sm" asChild>
            <a href={p.profileUrl} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink />
              Profil
            </a>
          </Button>
        ) : null}
        {mode === "suggestion" && applicationId ? (
          <form action={linkToApplication}>
            <input type="hidden" name="networkId" value={p.networkId} />
            <input type="hidden" name="applicationId" value={applicationId} />
            <Button type="submit" variant="secondary" size="sm">
              <Plus />
              Ajouter à cette candidature
            </Button>
          </form>
        ) : null}
        {mode === "linked" && applicationId ? (
          <form action={unlinkFromApplication}>
            <input type="hidden" name="networkId" value={p.networkId} />
            <input type="hidden" name="applicationId" value={applicationId} />
            <Button type="submit" variant="ghost" size="sm">
              <Link2Off />
              Retirer de cette candidature
            </Button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
