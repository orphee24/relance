"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import {
  addContact,
  extractTeamPage,
  importContacts,
  logInteraction,
  saveExtracted,
  updateContactNotes,
  type ExtractState,
  type ImportState,
} from "@/app/(app)/reseau/actions";
import { Select, textareaClass } from "@/components/applications/form-bits";
import { SubmitButton } from "@/components/auth/form-parts";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { INTERACTION_CHANNELS, INTERACTION_TYPES, ROLE_LABELS } from "@/lib/validation/network";

const idle: FormState = { status: "idle" };

function Check({ name, label, defaultChecked, error, hint }: { name: string; label: string; defaultChecked?: boolean; error?: string; hint?: string }) {
  return (
    <div className="grid gap-1">
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 shrink-0 accent-[var(--emerald)]" aria-invalid={Boolean(error)} />
        <span>{label}</span>
      </label>
      {hint && !error ? <p className="pl-6.5 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="pl-6.5 text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export function ContactForm({ applicationId, companyName }: { applicationId?: string | null; companyName?: string | null }) {
  const [state, action] = useActionState(addContact, idle);
  const [mutual, setMutual] = useState(state.values?.has_mutual_connection === "on");
  const e = state.fieldErrors ?? {};
  const v = (k: string, d = "") => state.values?.[k] ?? d;
  return (
    <form action={action} className="grid gap-5" noValidate>
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="application_id" value={applicationId ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="first_name" label="Prénom" error={e.first_name}>
          {(a) => <Input {...a} name="first_name" defaultValue={v("first_name")} />}
        </Field>
        <Field id="last_name" label="Nom" error={e.last_name}>
          {(a) => <Input {...a} name="last_name" defaultValue={v("last_name")} />}
        </Field>
        <Field id="current_title" label="Fonction actuelle" error={e.current_title}>
          {(a) => <Input {...a} name="current_title" placeholder="Lead Product Designer" defaultValue={v("current_title")} />}
        </Field>
        <Field id="company_name" label="Entreprise" error={e.company_name}>
          {(a) => <Input {...a} name="company_name" defaultValue={v("company_name", companyName ?? "")} />}
        </Field>
        <Field id="department" label="Service (facultatif)" error={e.department}>
          {(a) => <Input {...a} name="department" placeholder="Équipe Design" defaultValue={v("department")} />}
        </Field>
        <Field id="work_location" label="Lieu de travail (facultatif)" error={e.work_location}>
          {(a) => <Input {...a} name="work_location" defaultValue={v("work_location")} />}
        </Field>
        <Field id="role" label="Rôle par rapport au poste" error={e.role}>
          {(a) => (
            <Select {...a} name="role" defaultValue={v("role", "auto")}>
              {Object.entries(ROLE_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="provider" label="Comment l'avez-vous trouvée ?" error={e.provider}>
          {(a) => (
            <Select {...a} name="provider" defaultValue={v("provider", "assisted_search")}>
              <option value="assisted_search">Recherche sur une plateforme</option>
              <option value="company_site">Page officielle de l&apos;entreprise</option>
              <option value="user_manual">Je la connais / autre</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="profile_url" label="Lien du profil professionnel (facultatif)" error={e.profile_url}>
          {(a) => <Input {...a} name="profile_url" type="url" inputMode="url" placeholder="https://" defaultValue={v("profile_url")} />}
        </Field>
        <Field id="source_url" label="Page où vous l'avez trouvée (facultatif)" error={e.source_url}>
          {(a) => <Input {...a} name="source_url" type="url" inputMode="url" placeholder="https://" defaultValue={v("source_url")} />}
        </Field>
      </div>

      <div className="grid gap-3 rounded-control border border-line p-4">
        <Check
          name="verified"
          label="J'ai vérifié que cette personne occupe actuellement ce poste dans cette entreprise"
          hint="Sur son profil ou une page officielle, aujourd'hui. Sinon, la fiche reste « non vérifiée »."
          defaultChecked={state.values?.verified === "on"}
          error={e.verified}
        />
        <div className="grid gap-1">
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="has_mutual_connection" checked={mutual} onChange={(ev) => setMutual(ev.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--emerald)]" />
            <span>Nous avons une connexion commune</span>
          </label>
        </div>
        {mutual ? (
          <Field id="mutual_connection_note" label="Laquelle ?" error={e.mutual_connection_note}>
            {(a) => <Input {...a} name="mutual_connection_note" placeholder="Ancienne collègue chez Agence Exemple" defaultValue={v("mutual_connection_note")} />}
          </Field>
        ) : null}
        <Check name="is_alumni" label="Nous sommes issus de la même école" defaultChecked={state.values?.is_alumni === "on"} />
      </div>

      <Field id="notes" label="Notes (facultatif)" error={e.notes}>
        {(a) => <textarea {...a} name="notes" className={textareaClass} maxLength={10000} defaultValue={v("notes")} />}
      </Field>
      <p className="text-xs text-muted">
        N&apos;enregistrez que des informations professionnelles. Relance ne stocke ni téléphone ni email personnels, et vous pouvez
        supprimer cette fiche à tout moment.
      </p>
      <SubmitButton pendingLabel="Enregistrement…" className="w-auto justify-self-start">
        Ajouter à mon réseau
      </SubmitButton>
    </form>
  );
}

export function ImportForm() {
  const [state, action] = useActionState<ImportState, FormData>(importContacts, idle);
  const e = state.fieldErrors ?? {};
  if (state.status === "success" && state.result) {
    const r = state.result;
    return (
      <Alert tone="success" title={`${r.created} contact${r.created > 1 ? "s" : ""} importé${r.created > 1 ? "s" : ""}.`}>
        {r.duplicates ? `${r.duplicates} déjà présent${r.duplicates > 1 ? "s" : ""} dans votre réseau. ` : ""}
        {r.skipped ? `${r.skipped} ligne${r.skipped > 1 ? "s" : ""} ignorée${r.skipped > 1 ? "s" : ""}. ` : ""}
        {r.ignoredEmailColumn ? "Les adresses email du fichier ont été ignorées et ne sont pas conservées." : ""}
      </Alert>
    );
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field id="file" label="Fichier CSV de vos relations" hint="Par exemple l'export « Connections.csv » de vos données LinkedIn. 2 Mo maximum." error={e.file}>
        {(a) => (
          <input
            {...a}
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-sunken"
          />
        )}
      </Field>
      <Check
        name="consent"
        label="Ces personnes font partie de mes relations. Je les importe pour mon usage personnel, afin de préparer mes prises de contact."
        error={e.consent}
      />
      <SubmitButton pendingLabel="Import en cours…" className="w-auto justify-self-start">
        <FileUp />
        Importer
      </SubmitButton>
    </form>
  );
}

export function TeamPageExtractor({ companyName, applicationId }: { companyName: string; applicationId?: string | null }) {
  const [state, action] = useActionState<ExtractState, FormData>(extractTeamPage, idle);
  const [saveState, save] = useActionState(saveExtracted, idle);
  const e = state.fieldErrors ?? {};

  if (saveState.status === "success") return <Alert tone="success">{saveState.message}</Alert>;

  if (state.status === "success" && state.candidates) {
    return (
      <form action={save} className="grid gap-4">
        {saveState.message ? <Alert tone="danger">{saveState.message}</Alert> : null}
        <input type="hidden" name="candidates" value={JSON.stringify(state.candidates)} />
        <input type="hidden" name="source_url" value={state.sourceUrl ?? ""} />
        <input type="hidden" name="company_name" value={state.companyName ?? companyName} />
        <input type="hidden" name="application_id" value={state.applicationId ?? ""} />
        <p className="text-sm text-muted">
          {state.candidates.length} personne{state.candidates.length > 1 ? "s" : ""} reconnue{state.candidates.length > 1 ? "s" : ""}. Cochez celles
          qui sont pertinentes pour votre recherche ; les autres ne sont pas enregistrées.
        </p>
        <ul className="grid gap-1.5">
          {state.candidates.map((c, i) => (
            <li key={i}>
              <label className="flex items-start gap-3 rounded-control border border-line px-3 py-2 text-sm has-[:checked]:border-emerald has-[:checked]:bg-emerald-wash">
                <input type="checkbox" name="pick" value={i} className="mt-0.5 size-4 accent-[var(--emerald)]" />
                <span>
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="block text-muted">{c.title ?? "Fonction non indiquée"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <SubmitButton pendingLabel="Ajout…" className="w-auto justify-self-start">
          Ajouter la sélection à mon réseau
        </SubmitButton>
      </form>
    );
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.message ? <Alert tone="info">{state.message}</Alert> : null}
      <input type="hidden" name="company_name" value={companyName} />
      <input type="hidden" name="application_id" value={applicationId ?? ""} />
      <Field id="source_url" label="Adresse de la page officielle" error={e.source_url}>
        {(a) => <Input {...a} name="source_url" type="url" inputMode="url" placeholder="https://www.entreprise.fr/equipe" defaultValue={state.values?.source_url} />}
      </Field>
      <Field id="text" label="Texte de la page" hint="Sélectionnez le contenu de la page « équipe », copiez-le et collez-le ici. Relance n'ouvre pas la page lui-même." error={e.text}>
        {(a) => <textarea {...a} name="text" className={`${textareaClass} min-h-48`} defaultValue={state.values?.text} />}
      </Field>
      <SubmitButton pendingLabel="Analyse…" variant="secondary" className="w-auto justify-self-start">
        Repérer les personnes
      </SubmitButton>
    </form>
  );
}

export function InteractionForm({ networkId, blocked }: { networkId: string; blocked: boolean }) {
  const [state, action] = useActionState(logInteraction, idle);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  const types = Object.entries(INTERACTION_TYPES).filter(([k]) => !blocked || k === "note" || k === "reply_received");
  return (
    <form ref={ref} action={action} className="grid gap-3">
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="networkId" value={networkId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="type" label="Type" error={state.fieldErrors?.type}>
          {(a) => (
            <Select {...a} name="type" defaultValue={blocked ? "note" : "message_sent"}>
              {types.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="channel" label="Canal">
          {(a) => (
            <Select {...a} name="channel" defaultValue="">
              <option value="">Non précisé</option>
              {Object.entries(INTERACTION_CHANNELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field id="summary" label="Résumé (facultatif)" error={state.fieldErrors?.summary}>
        {(a) => <textarea {...a} name="summary" className={`${textareaClass} min-h-20`} maxLength={5000} />}
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Enregistrement…" className="w-auto justify-self-start">
        Enregistrer l&apos;échange
      </SubmitButton>
    </form>
  );
}

export function ContactNotesForm({ networkId, notes, hasMutual, mutualNote }: { networkId: string; notes: string | null; hasMutual: boolean; mutualNote: string | null }) {
  const [state, action] = useActionState(updateContactNotes, idle);
  const [mutual, setMutual] = useState(hasMutual);
  return (
    <form action={action} className="grid gap-3">
      {state.message ? <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert> : null}
      <input type="hidden" name="networkId" value={networkId} />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="has_mutual_connection" checked={mutual} onChange={(e) => setMutual(e.target.checked)} className="mt-0.5 size-4 accent-[var(--emerald)]" />
        Connexion commune
      </label>
      {mutual ? (
        <Field id="mutual_connection_note" label="Laquelle ?" error={state.fieldErrors?.mutual_connection_note}>
          {(a) => <Input {...a} name="mutual_connection_note" defaultValue={mutualNote ?? ""} maxLength={500} />}
        </Field>
      ) : null}
      <Field id="notes" label="Notes">
        {(a) => <textarea {...a} name="notes" className={textareaClass} defaultValue={notes ?? ""} maxLength={10000} />}
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Enregistrement…" className="w-auto justify-self-start">
        Enregistrer
      </SubmitButton>
    </form>
  );
}
