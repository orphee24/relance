"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, Send, Sparkles } from "lucide-react";
import { generateDraft, markDraftSent, saveCopiedDraft, type DraftState } from "@/app/(app)/_actions/messages";
import { Select, textareaClass } from "@/components/applications/form-bits";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { checkMessage, MAX_LENGTH, type CheckContext, type MessageFormat } from "@/server/messages/checks";
import { FORMATS, PURPOSES, RECIPIENT_TYPES, TONES, type Purpose, type RecipientType } from "@/server/messages/templates";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  networkId: string | null;
  applicationId: string | null;
  purposes: Purpose[];
  defaultPurpose: Purpose;
  allowedRecipients: RecipientType[];
  defaultRecipient: RecipientType;
  ctx: Omit<CheckContext, "format">;
  /** Message vers une personne (enregistre l'échange) ou relance de candidature. */
  kind: "contact" | "application";
  /** État initial (aperçu de démonstration). */
  initialDraft?: DraftState;
}

export function MessageComposer(props: ComposerProps) {
  const [state, action] = useActionState<DraftState, FormData>(generateDraft, props.initialDraft ?? { status: "idle" });
  const [format, setFormat] = useState<MessageFormat>(props.kind === "application" ? "email" : "message");
  const [purpose, setPurpose] = useState<Purpose>(props.defaultPurpose);
  const [recipient, setRecipient] = useState<RecipientType>(props.defaultRecipient);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [copied, setCopied] = useState(false);
  const [serverIssues, setServerIssues] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (state.status === "ready") {
      setBody(state.body ?? "");
      setSubject(state.subject ?? "");
      setCopied(false);
    }
  }, [state]);

  const issues = useMemo(() => (body ? checkMessage(body, { ...props.ctx, format }) : []), [body, format, props.ctx]);
  const blocking = issues.some((i) => i.severity === "error");
  const max = MAX_LENGTH[format];

  const copy = () =>
    start(async () => {
      setServerIssues(null);
      const r = await saveCopiedDraft({ draftId: state.draftId!, body, subject: format === "email" ? subject : undefined, format });
      if (!r.ok) {
        setServerIssues(r.issues?.filter((i) => i.severity === "error").map((i) => i.message).join(" ") || "Le message n'a pas pu être enregistré.");
        return;
      }
      await navigator.clipboard.writeText(format === "email" && subject ? `Objet : ${subject}\n\n${body}` : body);
      setCopied(true);
    });

  return (
    <div className="grid gap-5">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="networkId" value={props.networkId ?? ""} />
        <input type="hidden" name="applicationId" value={props.applicationId ?? ""} />
        {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="purpose" label="Objet du message">
            {(a) => (
              <Select {...a} name="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
                {props.purposes.map((p) => (
                  <option key={p} value={p}>
                    {PURPOSES[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="recipientType" label="Destinataire">
            {(a) => (
              <Select {...a} name="recipientType" value={recipient} onChange={(e) => setRecipient(e.target.value as RecipientType)}>
                {props.allowedRecipients.map((r) => (
                  <option key={r} value={r}>
                    {RECIPIENT_TYPES[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="tone" label="Ton">
            {(a) => (
              <Select {...a} name="tone" defaultValue="professional">
                {Object.entries(TONES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="format" label="Format">
            {(a) => (
              <Select {...a} name="format" value={format} onChange={(e) => setFormat(e.target.value as MessageFormat)}>
                {Object.entries(FORMATS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l} — {MAX_LENGTH[k as MessageFormat]} caractères max.
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {purpose === "intro_request" || recipient === "introducer" ? (
          <Field id="introTarget" label="Personne à qui être présenté (facultatif)">
            {(a) => <Input {...a} name="introTarget" placeholder="Claire Durand, Lead Product Designer" maxLength={120} />}
          </Field>
        ) : (
          <input type="hidden" name="introTarget" value="" />
        )}
        <SubmitButton variant={state.status === "ready" ? "secondary" : "primary"} pendingLabel="Préparation…" className="w-auto justify-self-start">
          <Sparkles />
          {state.status === "ready" ? "Proposer une autre version" : "Préparer le message"}
        </SubmitButton>
      </form>

      {state.status === "ready" ? (
        <div className="grid gap-3 border-t border-line pt-5">
          {state.note ? <Alert tone="info">{state.note}</Alert> : null}
          <p className="text-xs text-muted">
            {state.source === "ai" ? "Rédigé avec l'IA à partir de vos données vérifiées, puis contrôlé." : "Préparé à partir d'un modèle et de vos données vérifiées."} Relisez et
            personnalisez-le : c&apos;est vous qui l&apos;envoyez.
          </p>
          {format === "email" ? (
            <Field id="subject" label="Objet">
              {(a) => <Input {...a} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />}
            </Field>
          ) : null}
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="body">Message</Label>
              <span className={cn("text-xs tabular-nums", body.length > max ? "font-medium text-danger" : "text-faint")}>
                {body.length} / {max}
              </span>
            </div>
            <textarea id="body" value={body} onChange={(e) => { setBody(e.target.value); setCopied(false); }} className={cn(textareaClass, "min-h-64 leading-relaxed")} />
          </div>

          {issues.length ? (
            <ul className="grid gap-1.5" aria-live="polite">
              {issues.map((i) => (
                <li key={i.code} className={cn("text-sm", i.severity === "error" ? "font-medium text-danger" : "text-muted")}>
                  {i.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted" aria-live="polite">
              <Check className="size-4 text-emerald" aria-hidden="true" />
              Longueur, demande claire, aucune familiarité inventée.
            </p>
          )}
          {serverIssues ? <Alert tone="danger">{serverIssues}</Alert> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={copy} disabled={blocking || pending || !body.trim()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copié" : "Copier le message"}
            </Button>
            {copied ? (
              <form action={markDraftSent} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="draftId" value={state.draftId} />
                {props.kind === "contact" ? (
                  <label className="text-sm text-muted">
                    <span className="sr-only">Canal</span>
                    <select name="channel" defaultValue="linkedin" className="h-10 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink">
                      <option value="linkedin">LinkedIn</option>
                      <option value="email">Email</option>
                      <option value="other">Autre</option>
                    </select>
                  </label>
                ) : null}
                <SubmitButton variant="secondary" pendingLabel="Enregistrement…" className="w-auto">
                  <Send />
                  J&apos;ai envoyé ce message
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
