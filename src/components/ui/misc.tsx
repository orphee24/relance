import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "emerald" | "danger" }) {
  const tones = {
    neutral: "bg-sunken text-muted border-line",
    emerald: "bg-emerald-wash text-emerald-strong border-transparent dark:text-emerald",
    danger: "bg-danger-wash text-danger border-transparent",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Progress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={clamped}
      aria-label={label}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-emerald transition-transform duration-500"
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "danger";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "danger" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  const tones = {
    info: "border-line bg-sunken",
    success: "border-emerald/30 bg-emerald-wash",
    danger: "border-danger/30 bg-danger-wash",
  };
  const iconTone = { info: "text-muted", success: "text-emerald", danger: "text-danger" };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-control border px-3.5 py-3 text-sm", tones[tone], className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconTone[tone])} aria-hidden="true" />
      <div className="grid gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

/** État vide : oriente vers l'action, n'affiche jamais de données fictives. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-2", className)}>
      {Icon ? (
        <span className="grid size-9 place-items-center rounded-control bg-sunken text-muted">
          <Icon className="size-4" />
        </span>
      ) : null}
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="mt-0.5 max-w-prose text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
