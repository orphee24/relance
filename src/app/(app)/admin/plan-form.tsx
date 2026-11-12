"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/auth/form-parts";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { updatePlan } from "./actions";

export interface PlanRow {
  code: string;
  name: string;
  price_cents: number;
  active: boolean;
  quotas: { offer_analyses: number | null; tracked_applications: number | null; ai_follow_ups: number | null; network_searches_per_day: number; interview_coach: boolean };
}

export function PlanForm({ plan }: { plan: PlanRow }) {
  const [state, action] = useActionState(updatePlan, { status: "idle" } as FormState);
  const e = state.fieldErrors ?? {};
  const q = plan.quotas;
  const id = (k: string) => `${plan.code}-${k}`;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="code" value={plan.code} />
      {state.message ? <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert> : null}
      <Field id={id("price")} label="Prix (€)" error={e.price_euros}>
        {(a) => <Input {...a} name="price_euros" inputMode="decimal" defaultValue={(plan.price_cents / 100).toString().replace(".", ",")} disabled={plan.code === "free"} />}
      </Field>
      {plan.code === "free" ? <input type="hidden" name="price_euros" value="0" /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field id={id("oa")} label="Analyses" hint="Vide = illimité" error={e.offer_analyses}>
          {(a) => <Input {...a} name="offer_analyses" inputMode="numeric" defaultValue={q.offer_analyses ?? ""} />}
        </Field>
        <Field id={id("ta")} label="Candidatures suivies" error={e.tracked_applications}>
          {(a) => <Input {...a} name="tracked_applications" inputMode="numeric" defaultValue={q.tracked_applications ?? ""} />}
        </Field>
        <Field id={id("ai")} label="Rédactions IA" error={e.ai_follow_ups}>
          {(a) => <Input {...a} name="ai_follow_ups" inputMode="numeric" defaultValue={q.ai_follow_ups ?? ""} />}
        </Field>
        <Field id={id("ns")} label="Imports / jour" error={e.network_searches_per_day}>
          {(a) => <Input {...a} name="network_searches_per_day" inputMode="numeric" defaultValue={q.network_searches_per_day} />}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="interview_coach" defaultChecked={q.interview_coach} className="size-4 accent-[var(--emerald)]" />
        Coach d&apos;entretien inclus
      </label>
      {plan.code === "free" ? (
        <input type="hidden" name="active" value="on" />
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={plan.active} className="size-4 accent-[var(--emerald)]" />
          Proposé à l&apos;achat
        </label>
      )}
      <SubmitButton size="sm" variant="secondary" pendingLabel="Enregistrement…" className="w-auto justify-self-start">
        Enregistrer {plan.name}
      </SubmitButton>
    </form>
  );
}
