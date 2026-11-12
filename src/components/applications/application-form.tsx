"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createApplication, updateApplication, type CreateState } from "@/app/(app)/candidatures/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/config/domain";
import { CHANNELS } from "@/lib/validation/application";
import { CONTRACT_TYPES } from "@/lib/validation/onboarding";
import { Select, textareaClass, toLocalInput, TzInput } from "./form-bits";

export interface ApplicationDefaults {
  id?: string;
  company_name?: string | null;
  job_title?: string | null;
  offer_url?: string | null;
  location?: string | null;
  salary_text?: string | null;
  contract_type?: string | null;
  channel?: string | null;
  status?: string | null;
  applied_at?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  notes?: string | null;
}

export function ApplicationForm({ mode, defaults = {}, onDone }: { mode: "create" | "edit"; defaults?: ApplicationDefaults; onDone?: () => void }) {
  const [state, action] = useActionState<CreateState, FormData>(mode === "create" ? createApplication : updateApplication, { status: "idle" });
  // Conversion dans le fuseau du navigateur, après montage (évite un écart serveur/navigateur).
  const [nextAtLocal, setNextAtLocal] = useState<string | null>(null);
  useEffect(() => setNextAtLocal(toLocalInput(defaults.next_action_at)), [defaults.next_action_at]);
  const e = state.fieldErrors ?? {};
  const v = (k: keyof ApplicationDefaults) => state.values?.[k] ?? (defaults[k] == null ? "" : String(defaults[k]));

  useEffect(() => {
    if (mode === "edit" && state.status === "success") onDone?.();
  }, [mode, state, onDone]);

  return (
    <form action={action} className="grid gap-5" noValidate>
      <TzInput />
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      {state.duplicate ? (
        <Alert tone="info" title="Une candidature similaire existe déjà">
          <span className="grid gap-2">
            <span>
              <Link href={`/candidatures/${state.duplicate.id}`} className="font-medium text-emerald hover:underline">
                {state.duplicate.label}
              </Link>
              {state.duplicate.archived ? " (archivée)" : ""}. S&apos;il s&apos;agit d&apos;un autre poste, vous pouvez l&apos;ajouter quand même.
            </span>
            <span>
              <Button type="submit" name="confirm_duplicate" value="1" size="sm" variant="secondary">
                Ajouter quand même
              </Button>
            </span>
          </span>
        </Alert>
      ) : null}
      {state.message && !state.duplicate ? <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="company_name" label="Entreprise" error={e.company_name}>
          {(a) => <Input {...a} name="company_name" autoComplete="organization" defaultValue={v("company_name")} />}
        </Field>
        <Field id="job_title" label="Intitulé du poste" error={e.job_title}>
          {(a) => <Input {...a} name="job_title" defaultValue={v("job_title")} />}
        </Field>
        <Field id="status" label="Statut" error={e.status}>
          {(a) => (
            <Select {...a} name="status" defaultValue={v("status") || "to_prepare"}>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="applied_at" label="Date d'envoi" hint="Renseignée automatiquement au passage en « Envoyée »." error={e.applied_at}>
          {(a) => <Input {...a} name="applied_at" type="date" defaultValue={v("applied_at")} max={new Date().toISOString().slice(0, 10)} />}
        </Field>
        <Field id="channel" label="Canal de candidature" error={e.channel}>
          {(a) => (
            <Select {...a} name="channel" defaultValue={v("channel")}>
              <option value="">Non précisé</option>
              {Object.entries(CHANNELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="contract_type" label="Contrat" error={e.contract_type}>
          {(a) => (
            <Select {...a} name="contract_type" defaultValue={v("contract_type")}>
              <option value="">Non précisé</option>
              {Object.entries(CONTRACT_TYPES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="location" label="Lieu" error={e.location}>
          {(a) => <Input {...a} name="location" defaultValue={v("location")} />}
        </Field>
        <Field id="salary_text" label="Salaire annoncé" error={e.salary_text}>
          {(a) => <Input {...a} name="salary_text" placeholder="45-50 k€ brut annuel" defaultValue={v("salary_text")} />}
        </Field>
      </div>
      <Field id="offer_url" label="Lien de l'offre" error={e.offer_url}>
        {(a) => <Input {...a} name="offer_url" type="url" inputMode="url" placeholder="https://" defaultValue={v("offer_url")} />}
      </Field>

      <fieldset className="grid gap-4 rounded-control border border-line p-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <legend className="px-1 text-sm font-medium">Prochaine action</legend>
        <Field id="next_action" label="Action prévue" error={e.next_action}>
          {(a) => <Input {...a} name="next_action" placeholder="Relancer le recruteur" defaultValue={v("next_action")} />}
        </Field>
        <Field id="next_action_at" label="Échéance" error={e.next_action_at}>
          {(a) => (
            <Input
              {...a}
              key={`${nextAtLocal}-${state.values?.next_action_at ?? ""}`}
              name="next_action_at"
              type="datetime-local"
              defaultValue={state.values?.next_action_at ?? nextAtLocal ?? ""}
            />
          )}
        </Field>
      </fieldset>

      <Field id="notes" label="Notes" error={e.notes}>
        {(a) => <textarea {...a} name="notes" className={textareaClass} defaultValue={v("notes")} maxLength={20000} />}
      </Field>

      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Enregistrement…" className="w-auto">
          {mode === "create" ? "Ajouter la candidature" : "Enregistrer"}
        </SubmitButton>
        {mode === "edit" && onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}
