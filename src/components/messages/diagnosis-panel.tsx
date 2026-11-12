import Link from "next/link";
import { ConfidenceMark } from "@/components/ui/confidence";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { Diagnosis } from "@/server/followup/diagnosis";

function Section({ level, title, items }: { level: "verified" | "inferred" | "unknown"; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-1.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ConfidenceMark level={level} />
        {title}
      </p>
      <ul className="grid gap-1 pl-5 text-sm text-muted">
        {items.map((i) => (
          <li key={i} className="list-disc">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Diagnostic du silence : faits, hypothèses, inconnues. Jamais de motif de refus supposé. */
export function DiagnosisPanel({ d, applicationId, compact = false }: { d: Diagnosis; applicationId?: string; compact?: boolean }) {
  if (!d.applicable) return null;
  return (
    <Panel className="self-start">
      <PanelHeader title="Où en est cette candidature" description="Relance ne connaît pas le motif d'un silence. Voici ce qui est établi, ce qui est possible, et ce qu'on ignore." />
      <PanelBody className="grid gap-4">
        <div className="rounded-control border border-emerald/30 bg-emerald-wash px-3.5 py-3 text-sm">
          <p className="font-medium">Conseil</p>
          <p className="mt-0.5">{d.advice.text}</p>
          {compact && applicationId && (d.advice.kind === "follow_up" || d.advice.kind === "wait") ? (
            <Link href={`/candidatures/${applicationId}/relance`} className="mt-2 inline-block font-medium text-emerald hover:underline">
              Préparer une relance
            </Link>
          ) : null}
          {compact && applicationId && d.advice.kind === "contact_person" ? (
            <Link href={`/candidatures/${applicationId}#personnes`} className="mt-2 inline-block font-medium text-emerald hover:underline">
              Voir les personnes à contacter
            </Link>
          ) : null}
        </div>
        <Section level="verified" title="Faits" items={d.facts} />
        {compact ? null : (
          <>
            <Section level="inferred" title="Hypothèses possibles" items={d.hypotheses} />
            <Section level="unknown" title="Ce qu'on ne sait pas" items={d.unknowns} />
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
