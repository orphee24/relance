import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-faint",
        "transition-colors focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/25",
        "aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium text-ink", className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (aria: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
  labelAside?: React.ReactNode;
}

/** Champ de formulaire accessible : label, aide et erreur reliés par aria-describedby. */
export function Field({ id, label, hint, error, children, labelAside }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
