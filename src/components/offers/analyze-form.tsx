"use client";

import { useActionState, useState } from "react";
import { analyzeOfferAction } from "@/app/(app)/analyser/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Field, Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

export interface VersionOption {
  id: string;
  label: string;
  primary: boolean;
}

const textareaClass =
  "min-h-72 w-full rounded-control border border-line-strong bg-surface px-3 py-2.5 text-base leading-relaxed text-ink placeholder:text-faint focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/25 aria-[invalid=true]:border-danger sm:text-sm";

export function AnalyzeOfferForm({ versions, disabled }: { versions: VersionOption[]; disabled: boolean }) {
  const [state, action] = useActionState(analyzeOfferAction, { status: "idle" } as FormState);
  const [length, setLength] = useState(state.values?.description?.length ?? 0);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const defaultVersion = v.resumeVersionId || versions.find((x) => x.primary)?.id || versions[0]?.id || "";

  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="description">Texte de l&apos;offre</Label>
          <span className={cn("text-xs tabular-nums", length > 30000 ? "text-danger" : "text-faint")}>
            {length.toLocaleString("fr-FR")} / 30 000
          </span>
        </div>
        <textarea
          id="description"
          name="description"
          className={textareaClass}
          placeholder="Collez ici l'intégralité de l'offre : intitulé, missions, profil recherché…"
          defaultValue={v.description}
          onChange={(ev) => setLength(ev.target.value.length)}
          aria-invalid={Boolean(e.description)}
          aria-describedby={e.description ? "description-error" : "description-hint"}
        />
        {e.description ? (
          <p id="description-error" className="text-xs font-medium text-danger">
            {e.description}
          </p>
        ) : (
          <p id="description-hint" className="text-xs text-muted">
            Copiez le texte depuis la page de l&apos;offre. Relance n&apos;ouvre pas les liens à votre place.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="company" label="Entreprise" error={e.company}>
          {(a) => <Input {...a} name="company" autoComplete="organization" defaultValue={v.company} />}
        </Field>
        <Field id="title" label="Intitulé du poste (facultatif)" hint="Sinon, Relance reprend la première ligne de l'offre." error={e.title}>
          {(a) => <Input {...a} name="title" defaultValue={v.title} />}
        </Field>
        <Field id="location" label="Lieu (facultatif)" error={e.location}>
          {(a) => <Input {...a} name="location" defaultValue={v.location} />}
        </Field>
        <Field id="url" label="Lien de l'offre (facultatif)" hint="Conservé pour référence." error={e.url}>
          {(a) => <Input {...a} name="url" type="url" inputMode="url" placeholder="https://" defaultValue={v.url} />}
        </Field>
      </div>

      {versions.length > 0 ? (
        <Field id="resumeVersionId" label="Comparer avec">
          {(a) => (
            <select
              {...a}
              name="resumeVersionId"
              defaultValue={defaultVersion}
              className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/25 sm:text-sm"
            >
              {versions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {o.primary ? " (principal)" : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <Alert tone="info" title="Aucun CV vérifié">
          L&apos;offre sera analysée, mais sans score de couverture. Importez et vérifiez votre CV pour comparer.
        </Alert>
      )}

      <SubmitButton pendingLabel="Analyse en cours…" disabled={disabled} className="w-full sm:w-auto sm:justify-self-start">
        Analyser l&apos;offre
      </SubmitButton>
    </form>
  );
}
