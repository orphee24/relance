"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/auth/form-parts";
import { textareaClass } from "@/components/applications/form-bits";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { starFeedback, type StarAnswer } from "@/server/interview/prep";
import { saveStarAnswer } from "./actions";

const FIELDS: [keyof StarAnswer, string, string][] = [
  ["situation", "Situation", "Le contexte, en une ou deux phrases."],
  ["task", "Tâche", "Votre rôle ou l'objectif à atteindre."],
  ["action", "Action", "Ce que vous avez fait, vous, concrètement."],
  ["result", "Résultat", "Ce qui a changé, chiffré si possible."],
];

export function StarForm({ applicationId, questionId, initial, evidence }: { applicationId: string; questionId: string; initial: StarAnswer | null; evidence: string | null }) {
  const [state, action] = useActionState(saveStarAnswer, { status: "idle" } as FormState);
  const [answer, setAnswer] = useState<StarAnswer>(initial ?? { situation: evidence ?? "", task: "", action: "", result: "" });
  const notes = useMemo(() => (Object.values(answer).some((v) => v.trim()) ? starFeedback(answer) : []), [answer]);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="questionId" value={questionId} />
      {FIELDS.map(([key, label, hint]) => (
        <label key={key} className="grid gap-1 text-sm">
          <span className="font-medium">
            {label} <span className="font-normal text-muted">— {hint}</span>
          </span>
          <textarea
            name={key}
            value={answer[key]}
            onChange={(e) => setAnswer((a) => ({ ...a, [key]: e.target.value }))}
            className={`${textareaClass} min-h-16`}
            maxLength={key === "action" ? 3000 : 2000}
          />
        </label>
      ))}
      {notes.length ? (
        <ul className="grid gap-1 text-sm text-muted" aria-live="polite">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {state.message ? <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert> : null}
      <SubmitButton size="sm" variant="secondary" pendingLabel="Enregistrement…" className="w-auto justify-self-start">
        Enregistrer ma réponse
      </SubmitButton>
    </form>
  );
}
