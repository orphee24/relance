"use client";

import { useActionState, useState } from "react";
import { Check, Info, RotateCcw, X } from "lucide-react";
import { decideSuggestion } from "@/app/(app)/analyser/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation/auth";
import type { Suggestion } from "@/lib/validation/offer";
import { cn } from "@/lib/utils";

function Decision({ offerId, suggestion, decision, children, variant = "secondary" }: {
  offerId: string;
  suggestion: Suggestion;
  decision: "accept" | "refuse" | "reset";
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [, action, pending] = useActionState(decideSuggestion, { status: "idle" } as FormState);
  return (
    <form action={action}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {children}
      </Button>
    </form>
  );
}

function DeclareForm({ offerId, suggestion, onCancel }: { offerId: string; suggestion: Suggestion; onCancel: () => void }) {
  const [state, action] = useActionState(decideSuggestion, { status: "idle" } as FormState);
  return (
    <form action={action} className="grid gap-3 rounded-control border border-line bg-sunken p-3">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <input type="hidden" name="decision" value="accept" />
      <Field id={`skill-${suggestion.id}`} label="Compétence à ajouter" error={state.fieldErrors?.skillName}>
        {(a) => <Input {...a} name="skillName" maxLength={120} />}
      </Field>
      <Field
        id={`note-${suggestion.id}`}
        label="Où l'avez-vous pratiquée ?"
        hint="Par exemple : « Utilisé 2 ans chez Fintech Exemple pour les clôtures mensuelles ». Cette justification reste privée."
        error={state.fieldErrors?.note}
      >
        {(a) => <Input {...a} name="note" maxLength={500} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Check />
          Je possède cette compétence
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

export function SuggestionCard({ offerId, suggestion }: { offerId: string; suggestion: Suggestion }) {
  const [declaring, setDeclaring] = useState(false);
  const decided = suggestion.status !== "pending";

  return (
    <li className={cn("grid gap-3 px-5 py-4", suggestion.status === "refused" && "opacity-60")}>
      <div className="flex items-start gap-3">
        {suggestion.type === "information" ? <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{suggestion.title}</p>
          <p className="mt-0.5 text-sm text-muted">{suggestion.detail}</p>
          {suggestion.resumeEvidence ? (
            <blockquote className="mt-2 border-l-2 border-emerald/50 pl-3 text-sm">Dans votre CV : « {suggestion.resumeEvidence} »</blockquote>
          ) : null}
          {suggestion.status === "accepted" && suggestion.type === "declare_if_true" ? (
            <p className="mt-2 text-sm">
              Vous avez déclaré <span className="font-medium">{suggestion.skillName}</span> : « {suggestion.userNote} »
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-faint">Critère concerné : {suggestion.requirementLabel}</p>
        </div>
        {decided ? (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", suggestion.status === "accepted" ? "bg-emerald-wash text-ink" : "bg-sunken text-muted")}>
            {suggestion.status === "accepted" ? "Acceptée" : "Refusée"}
          </span>
        ) : null}
      </div>

      {suggestion.type !== "information" ? (
        decided ? (
          <div>
            <Decision offerId={offerId} suggestion={suggestion} decision="reset" variant="ghost">
              <RotateCcw />
              Revenir sur ma décision
            </Decision>
          </div>
        ) : declaring ? (
          <DeclareForm offerId={offerId} suggestion={suggestion} onCancel={() => setDeclaring(false)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            {suggestion.type === "add_skill_from_resume" ? (
              <Decision offerId={offerId} suggestion={suggestion} decision="accept">
                <Check />
                Accepter
              </Decision>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setDeclaring(true)}>
                <Check />
                Je possède cette compétence
              </Button>
            )}
            <Decision offerId={offerId} suggestion={suggestion} decision="refuse" variant="ghost">
              <X />
              {suggestion.type === "add_skill_from_resume" ? "Refuser" : "Je ne l'ai pas"}
            </Decision>
          </div>
        )
      ) : null}
    </li>
  );
}
