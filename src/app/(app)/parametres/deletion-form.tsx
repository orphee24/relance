"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/auth/form-parts";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { requestAccountDeletion } from "./actions";

export function DeletionForm() {
  const [state, action] = useActionState(requestAccountDeletion, { status: "idle" } as FormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="grid max-w-sm gap-3">
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field id="confirm" label="Pour confirmer, saisissez SUPPRIMER" error={state.fieldErrors?.confirm}>
        {(a) => <Input {...a} name="confirm" autoComplete="off" />}
      </Field>
      <SubmitButton variant="danger" pendingLabel="Enregistrement…" className="w-auto justify-self-start">
        Demander la suppression de mon compte
      </SubmitButton>
    </form>
  );
}
