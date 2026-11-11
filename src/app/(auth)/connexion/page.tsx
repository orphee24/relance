import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/auth-forms";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { Alert } from "@/components/ui/misc";
import { isGoogleAuthEnabled } from "@/lib/env";
import { safeRedirectPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  lien: "Ce lien n'est plus valide ou a déjà été utilisé. Connectez-vous ou demandez un nouveau lien.",
  oauth: "La connexion avec Google n'a pas abouti. Réessayez ou utilisez votre email.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = params.next ? safeRedirectPath(params.next) : undefined;
  const error = params.erreur ? ERRORS[params.erreur] : undefined;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Connexion</h1>
        <p className="mt-1 text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-emerald hover:underline">
            Créer un compte
          </Link>
        </p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {isGoogleAuthEnabled() ? (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      ) : null}
      <SignInForm next={next} />
    </div>
  );
}
