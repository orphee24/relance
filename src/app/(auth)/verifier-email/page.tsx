import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { ResendVerificationForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Vérifiez votre email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="grid gap-6">
      <span className="grid size-10 place-items-center rounded-control bg-emerald-wash text-emerald">
        <MailCheck className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h1 className="text-xl font-semibold">Confirmez votre adresse email</h1>
        <p className="mt-1 text-sm text-muted">
          {email ? (
            <>
              Un lien de confirmation a été envoyé à <span className="font-medium text-ink">{email}</span>.
            </>
          ) : (
            "Un lien de confirmation vous a été envoyé."
          )}{" "}
          Ouvrez-le pour activer votre compte. Pensez à vérifier vos courriers indésirables.
        </p>
      </div>
      <ResendVerificationForm email={email} />
      <Link href="/connexion" className="text-sm font-medium text-emerald hover:underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
