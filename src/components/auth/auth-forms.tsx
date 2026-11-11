"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordReset,
  resendVerification,
  signIn,
  signUp,
  updatePassword,
} from "@/app/(auth)/actions";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { PasswordInput, SubmitButton } from "./form-parts";

const initial: FormState = { status: "idle" };

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert>;
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field id="email" label="Adresse email" error={state.fieldErrors?.email}>
        {(a) => (
          <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />
        )}
      </Field>
      <Field
        id="password"
        label="Mot de passe"
        error={state.fieldErrors?.password}
        labelAside={
          <Link href="/mot-de-passe-oublie" className="text-xs text-emerald hover:underline">
            Mot de passe oublié ?
          </Link>
        }
      >
        {(a) => <PasswordInput {...a} name="password" autoComplete="current-password" required />}
      </Field>
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUp, initial);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="Prénom" error={e.firstName}>
          {(a) => <Input {...a} name="firstName" autoComplete="given-name" required defaultValue={state.values?.firstName} />}
        </Field>
        <Field id="lastName" label="Nom" error={e.lastName}>
          {(a) => <Input {...a} name="lastName" autoComplete="family-name" required defaultValue={state.values?.lastName} />}
        </Field>
      </div>
      <Field id="email" label="Adresse email" error={e.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />}
      </Field>
      <Field id="password" label="Mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={e.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="new-password" required minLength={10} />}
      </Field>
      <div className="grid gap-1.5">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-0.5 size-4 shrink-0 accent-[var(--emerald)]"
            aria-invalid={Boolean(e.acceptTerms)}
            aria-describedby={e.acceptTerms ? "acceptTerms-error" : undefined}
          />
          <span className="text-muted">
            J&apos;accepte les{" "}
            <Link href="/cgu" className="text-emerald underline-offset-2 hover:underline">
              conditions d&apos;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/confidentialite" className="text-emerald underline-offset-2 hover:underline">
              politique de confidentialité
            </Link>
            .
          </span>
        </label>
        {e.acceptTerms ? (
          <p id="acceptTerms-error" className="text-xs font-medium text-danger">
            {e.acceptTerms}
          </p>
        ) : null}
      </div>
      <SubmitButton pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Adresse email" error={state.fieldErrors?.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />}
      </Field>
      <SubmitButton pendingLabel="Envoi…">Recevoir un lien de réinitialisation</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <Field id="password" label="Nouveau mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre." error={state.fieldErrors?.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="new-password" required />}
      </Field>
      <Field id="confirmPassword" label="Confirmez le mot de passe" error={state.fieldErrors?.confirmPassword}>
        {(a) => <PasswordInput {...a} name="confirmPassword" autoComplete="new-password" required />}
      </Field>
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = useActionState(resendVerification, initial);
  return (
    <form action={action} className="grid gap-3" noValidate>
      <FormMessage state={state} />
      <Field id="email" label="Adresse email" error={state.fieldErrors?.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={email} />}
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Envoi…">
        Renvoyer le lien
      </SubmitButton>
    </form>
  );
}
