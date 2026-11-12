"use client";

import { useActionState } from "react";
import { startCheckout } from "@/app/(app)/parametres/forfait/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";

export function PurchaseForm({ plan, label, extends: extendsCurrent }: { plan: "pro" | "premium"; label: string; extends: boolean }) {
  const [state, action] = useActionState(startCheckout, { status: "idle" } as FormState);
  const error = state.fieldErrors?.waiver;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="plan" value={plan} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <label className="flex items-start gap-2.5 text-xs text-muted">
        <input type="checkbox" name="waiver" className="mt-0.5 size-4 shrink-0 accent-[var(--emerald)]" aria-invalid={Boolean(error)} aria-describedby={error ? `waiver-${plan}-error` : undefined} />
        <span>
          Je demande l&apos;accès immédiat au forfait et je reconnais perdre mon droit de rétractation de 14 jours dès le début de son
          exécution.
        </span>
      </label>
      {error ? (
        <p id={`waiver-${plan}-error`} className="-mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Redirection vers le paiement…" className="w-full">
        {extendsCurrent ? `Prolonger de 30 jours` : label}
      </SubmitButton>
    </form>
  );
}
