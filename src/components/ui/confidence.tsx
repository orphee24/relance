import { cn } from "@/lib/utils";

export type Confidence = "verified" | "inferred" | "unknown";

const LABELS: Record<Confidence, string> = {
  verified: "Vérifié",
  inferred: "Hypothèse",
  unknown: "Inconnu",
};

const DESCRIPTIONS: Record<Confidence, string> = {
  verified: "Constaté dans une source identifiée",
  inferred: "Déduit, à confirmer",
  unknown: "Aucune information disponible",
};

/**
 * Marqueur de fiabilité — signature visuelle de Relance.
 * La forme porte le sens (plein / demi / anneau), la couleur le renforce :
 * lisible sans la couleur (WCAG 1.4.1).
 */
export function ConfidenceMark({ level, className }: { level: Confidence; className?: string }) {
  const color =
    level === "verified" ? "text-verified" : level === "inferred" ? "text-inferred" : "text-unknown";
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cn("size-3 shrink-0", color, className)}>
      {level === "verified" && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {level === "inferred" && (
        <>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" />
        </>
      )}
      {level === "unknown" && (
        <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />
      )}
    </svg>
  );
}

export function ConfidenceBadge({
  level,
  label,
  className,
}: {
  level: Confidence;
  /** Libellé personnalisé ; par défaut « Vérifié / Hypothèse / Inconnu ». */
  label?: string;
  className?: string;
}) {
  const bg =
    level === "verified" ? "bg-emerald-wash" : level === "inferred" ? "bg-inferred-wash" : "bg-unknown-wash";
  return (
    <span
      title={DESCRIPTIONS[level]}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink", bg, className)}
    >
      <ConfidenceMark level={level} />
      {label ?? LABELS[level]}
    </span>
  );
}

export function ConfidenceLegend({ className }: { className?: string }) {
  return (
    <dl className={cn("grid gap-2 text-sm", className)}>
      {(Object.keys(LABELS) as Confidence[]).map((level) => (
        <div key={level} className="flex items-center gap-2.5">
          <dt className="flex w-24 items-center gap-2 font-medium">
            <ConfidenceMark level={level} />
            {LABELS[level]}
          </dt>
          <dd className="text-muted">{DESCRIPTIONS[level]}</dd>
        </div>
      ))}
    </dl>
  );
}
