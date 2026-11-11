"use client";

import { useActionState } from "react";
import { saveOnboardingStep } from "@/app/(onboarding)/onboarding/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { CONTRACT_TYPES, EXPERIENCE_LEVELS, MOBILITY } from "@/lib/validation/onboarding";
import { cn } from "@/lib/utils";
import Link from "next/link";

export interface ProfileDefaults {
  first_name?: string | null;
  last_name?: string | null;
  target_job?: string | null;
  experience_level?: string | null;
  experience_years?: number | null;
  location?: string | null;
  mobility?: string | null;
  contract_types?: string[] | null;
  sectors?: string[] | null;
  desired_salary_min?: number | null;
  desired_salary_max?: number | null;
  available_from?: string | null;
}

const initial: FormState = { status: "idle" };

function StepShell({
  step,
  optional,
  children,
  state,
  action,
}: {
  step: number;
  optional: boolean;
  children: React.ReactNode;
  state: FormState;
  action: (fd: FormData) => void;
}) {
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="step" value={step} />
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <SubmitButton pendingLabel="Enregistrement…" className="w-auto" name="intent" value="save">
          Continuer
        </SubmitButton>
        {optional ? (
          <Button type="submit" name="intent" value="skip" variant="ghost" formNoValidate>
            Passer cette étape
          </Button>
        ) : null}
        {step > 1 ? (
          <Link href={`/onboarding?etape=${step - 1}`} className="ml-auto text-sm text-muted hover:text-ink">
            Étape précédente
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** Groupe de choix (radio ou cases à cocher) présenté en options cliquables. */
function ChoiceGroup({
  legend,
  name,
  type,
  options,
  defaultValue,
  error,
  hint,
}: {
  legend: string;
  name: string;
  type: "radio" | "checkbox";
  options: Record<string, string>;
  defaultValue: string[];
  error?: string;
  hint?: string;
}) {
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      {hint ? <p className="-mt-1 mb-1 text-xs text-muted">{hint}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(options).map(([value, label]) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5 text-sm transition-colors",
              "hover:border-line-strong has-[:checked]:border-emerald has-[:checked]:bg-emerald-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
            )}
          >
            <input type={type} name={name} value={value} defaultChecked={defaultValue.includes(value)} className="size-4 accent-[var(--emerald)]" />
            {label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${name}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

const v = (state: FormState, key: string, fallback: unknown) =>
  state.values?.[key] ?? (fallback == null ? "" : String(fallback));

export function StepIdentity({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action] = useActionState(saveOnboardingStep, initial);
  const e = state.fieldErrors ?? {};
  return (
    <StepShell step={1} optional={false} state={state} action={action}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="first_name" label="Prénom" error={e.first_name}>
          {(a) => <Input {...a} name="first_name" autoComplete="given-name" defaultValue={v(state, "first_name", defaults.first_name)} />}
        </Field>
        <Field id="last_name" label="Nom" error={e.last_name}>
          {(a) => <Input {...a} name="last_name" autoComplete="family-name" defaultValue={v(state, "last_name", defaults.last_name)} />}
        </Field>
      </div>
    </StepShell>
  );
}

export function StepJob({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action] = useActionState(saveOnboardingStep, initial);
  const e = state.fieldErrors ?? {};
  return (
    <StepShell step={2} optional={false} state={state} action={action}>
      <Field id="target_job" label="Métier recherché" hint="Par exemple : Product Designer, Comptable, Chargée de recrutement." error={e.target_job}>
        {(a) => <Input {...a} name="target_job" autoComplete="organization-title" defaultValue={v(state, "target_job", defaults.target_job)} />}
      </Field>
      <ChoiceGroup
        legend="Votre expérience"
        name="experience_level"
        type="radio"
        options={EXPERIENCE_LEVELS}
        defaultValue={[v(state, "experience_level", defaults.experience_level)]}
        error={e.experience_level}
      />
      <Field id="experience_years" label="Années d'expérience (facultatif)" error={e.experience_years}>
        {(a) => <Input {...a} name="experience_years" inputMode="numeric" className="max-w-32" defaultValue={v(state, "experience_years", defaults.experience_years)} />}
      </Field>
    </StepShell>
  );
}

export function StepLocation({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action] = useActionState(saveOnboardingStep, initial);
  const e = state.fieldErrors ?? {};
  const contracts = state.values?.contract_types?.split(",").filter(Boolean) ?? defaults.contract_types ?? [];
  return (
    <StepShell step={3} optional state={state} action={action}>
      <Field id="location" label="Ville ou région" error={e.location}>
        {(a) => <Input {...a} name="location" autoComplete="address-level2" defaultValue={v(state, "location", defaults.location)} />}
      </Field>
      <ChoiceGroup legend="Mobilité" name="mobility" type="radio" options={MOBILITY} defaultValue={[v(state, "mobility", defaults.mobility)]} error={e.mobility} />
      <ChoiceGroup
        legend="Types de contrat recherchés"
        hint="Plusieurs choix possibles."
        name="contract_types"
        type="checkbox"
        options={CONTRACT_TYPES}
        defaultValue={contracts}
        error={e.contract_types}
      />
    </StepShell>
  );
}

export function StepPreferences({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action] = useActionState(saveOnboardingStep, initial);
  const e = state.fieldErrors ?? {};
  return (
    <StepShell step={4} optional state={state} action={action}>
      <Field id="sectors" label="Secteurs qui vous intéressent" hint="Séparés par des virgules : santé, fintech, industrie…" error={e.sectors}>
        {(a) => <Input {...a} name="sectors" defaultValue={v(state, "sectors", defaults.sectors?.join(", "))} />}
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Salaire souhaité, brut annuel en euros (facultatif)</legend>
        <p className="-mt-1 mb-1 text-xs text-muted">Cette information reste privée. Elle servira à préparer vos négociations.</p>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field id="desired_salary_min" label="Minimum" error={e.desired_salary_min}>
            {(a) => <Input {...a} name="desired_salary_min" inputMode="numeric" placeholder="42000" defaultValue={v(state, "desired_salary_min", defaults.desired_salary_min)} />}
          </Field>
          <Field id="desired_salary_max" label="Maximum" error={e.desired_salary_max}>
            {(a) => <Input {...a} name="desired_salary_max" inputMode="numeric" placeholder="50000" defaultValue={v(state, "desired_salary_max", defaults.desired_salary_max)} />}
          </Field>
        </div>
      </fieldset>
      <Field id="available_from" label="Disponible à partir du (facultatif)" error={e.available_from}>
        {(a) => <Input {...a} name="available_from" type="date" className="max-w-48" defaultValue={v(state, "available_from", defaults.available_from)} />}
      </Field>
    </StepShell>
  );
}
