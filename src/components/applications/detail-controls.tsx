"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { addNote, addReminder, moveApplication } from "@/app/(app)/candidatures/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/config/domain";
import type { FormState } from "@/lib/validation/auth";
import { requiresExplicitConfirmation } from "@/server/applications/insights";
import { ApplicationForm, type ApplicationDefaults } from "./application-form";
import { textareaClass, TzInput } from "./form-bits";
import { ConfirmDialog } from "./kanban";
import { Select } from "./form-bits";

export function StatusControl({ id, status }: { id: string; status: ApplicationStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(status), [status]);

  const commit = (to: ApplicationStatus, note?: string) => {
    const previous = value;
    setValue(to);
    setError(null);
    start(async () => {
      const r = await moveApplication(id, to, note);
      if (!r.ok) {
        setValue(previous);
        setError(r.message ?? "Le statut n'a pas pu être modifié.");
      } else router.refresh();
    });
  };

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs text-muted">
        Statut
        <Select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const to = e.target.value as ApplicationStatus;
            if (requiresExplicitConfirmation(to)) setConfirm(to);
            else commit(to);
          }}
          className="w-56"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {APPLICATION_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </label>
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
      {confirm ? (
        <ConfirmDialog
          title={`Marquer comme « ${APPLICATION_STATUS_LABELS[confirm]} » ?`}
          text={requiresExplicitConfirmation(confirm) ?? ""}
          onCancel={() => setConfirm(null)}
          onConfirm={(note) => {
            commit(confirm, note);
            setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  return ref;
}

export function NoteForm({ id }: { id: string }) {
  const [state, action] = useActionState(addNote, { status: "idle" } as FormState);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <label htmlFor="note-text" className="sr-only">
        Ajouter une note
      </label>
      <textarea
        id="note-text"
        name="text"
        className={`${textareaClass} min-h-20`}
        placeholder="Échange avec le recruteur, impression après un entretien…"
        maxLength={2000}
        aria-invalid={Boolean(state.fieldErrors?.text)}
      />
      {state.fieldErrors?.text ? <p className="text-xs font-medium text-danger">{state.fieldErrors.text}</p> : null}
      <SubmitButton size="sm" variant="secondary" pendingLabel="Ajout…" className="w-auto justify-self-start">
        Ajouter la note
      </SubmitButton>
    </form>
  );
}

export function ReminderForm({ id }: { id: string }) {
  const [state, action] = useActionState(addReminder, { status: "idle" } as FormState);
  const ref = useResetOnSuccess(state);
  const [min, setMin] = useState<string>();
  useEffect(() => setMin(new Date().toISOString().slice(0, 10)), []);
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <TzInput />
      <input type="hidden" name="id" value={id} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field id="reminder-title" label="Rappel" error={state.fieldErrors?.title}>
        {(a) => <Input {...a} name="title" placeholder="Relancer le recruteur" maxLength={300} />}
      </Field>
      <Field id="reminder-due" label="Date" error={state.fieldErrors?.due_at}>
        {(a) => <Input {...a} name="due_at" type="date" min={min} />}
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Ajout…" className="w-auto justify-self-start">
        Programmer le rappel
      </SubmitButton>
    </form>
  );
}

export function EditableDetails({ defaults, children }: { defaults: ApplicationDefaults; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ApplicationForm
        mode="edit"
        defaults={defaults}
        onDone={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }
  return (
    <div className="grid gap-4">
      {children}
      <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setEditing(true)}>
        <Pencil />
        Modifier
      </Button>
    </div>
  );
}
