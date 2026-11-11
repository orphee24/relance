import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ResetPasswordPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Choisir un nouveau mot de passe</h1>
        <p className="mt-1 text-sm text-muted">Vous serez connecté dès qu&apos;il sera enregistré.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
