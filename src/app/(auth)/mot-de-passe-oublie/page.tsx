import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-muted">Indiquez l&apos;adresse de votre compte : nous vous enverrons un lien pour en choisir un nouveau.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/connexion" className="text-sm font-medium text-emerald hover:underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
