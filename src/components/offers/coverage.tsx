import type { CoverageState } from "@/lib/validation/offer";
import { cn } from "@/lib/utils";

export const COVERAGE_LABELS: Record<CoverageState, string> = {
  demonstrated: "Démontré",
  partial: "Partiel",
  missing: "Non démontré",
  unknown: "Indéterminé",
};

/** Même langage de formes que le marqueur de fiabilité : plein, demi, anneau, pointillé. */
export function CoverageMark({ state, className }: { state: CoverageState; className?: string }) {
  const color = { demonstrated: "text-verified", partial: "text-inferred", missing: "text-danger", unknown: "text-unknown" }[state];
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cn("size-3 shrink-0", color, className)}>
      {state === "demonstrated" && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {state === "partial" && (
        <>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" />
        </>
      )}
      {state === "missing" && <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {state === "unknown" && <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />}
    </svg>
  );
}

export function CoverageBadge({ state }: { state: CoverageState }) {
  const bg = { demonstrated: "bg-emerald-wash", partial: "bg-inferred-wash", missing: "bg-danger-wash", unknown: "bg-unknown-wash" }[state];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink", bg)}>
      <CoverageMark state={state} />
      {COVERAGE_LABELS[state]}
    </span>
  );
}

/** Jauge de couverture : le nombre est l'élément mis en avant de la page de résultats. */
export function CoverageGauge({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <div className="grid gap-3">
      <p className="flex items-baseline gap-1 tabular-nums">
        <span className="text-[3.5rem] font-semibold leading-none tracking-[-0.04em]">{rounded}</span>
        <span className="text-xl font-semibold text-muted">%</span>
      </p>
      <div
        className="relative h-2 overflow-hidden rounded-full bg-sunken"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-label="Couverture estimée des critères de l'offre"
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-emerald" style={{ width: `${rounded}%` }} />
      </div>
    </div>
  );
}
