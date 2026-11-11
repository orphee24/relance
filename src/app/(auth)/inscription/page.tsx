import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/auth-forms";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { isGoogleAuthEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignUpPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Créer votre compte</h1>
        <p className="mt-1 text-sm text-muted">
          Gratuit, sans carte bancaire. Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-emerald hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
      {isGoogleAuthEnabled() ? (
        <>
          <GoogleButton label="S'inscrire avec Google" />
          <OrDivider />
        </>
      ) : null}
      <SignUpForm />
    </div>
  );
}
