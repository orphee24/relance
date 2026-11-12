import { APPLICATION_STATUS_LABELS, PIPELINE_STAGES, type ApplicationStatus } from "@/config/domain";
import { cn } from "@/lib/utils";

/** Avancement exprimé par l'intensité de l'émeraude ; les candidatures closes restent discrètes. */
const STAGE_STYLE: Record<string, { badge: string; dot: string }> = {
  prep: { badge: "border-line-strong bg-surface text-muted", dot: "bg-line-strong" },
  waiting: { badge: "border-transparent bg-sunken text-ink", dot: "bg-emerald/45" },
  interview: { badge: "border-transparent bg-emerald-wash text-ink", dot: "bg-emerald/75" },
  offer: { badge: "border-transparent bg-emerald text-on-emerald", dot: "bg-emerald" },
  closed: { badge: "border-line bg-transparent text-faint", dot: "bg-faint/50" },
};

export function stageOf(status: ApplicationStatus): string {
  return PIPELINE_STAGES.find((s) => s.statuses.includes(status))?.key ?? "prep";
}

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  const style = STAGE_STYLE[stageOf(status)]!;
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", style.badge, className)}>
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}

export function StatusDot({ status, className }: { status: ApplicationStatus; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", STAGE_STYLE[stageOf(status)]!.dot, className)} />;
}
