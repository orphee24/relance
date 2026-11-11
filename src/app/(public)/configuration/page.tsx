import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Configuration requise" };

export default function ConfigurationPage() {
  if (isSupabaseConfigured()) redirect("/connexion");
  return (
    <div className="max-w-2xl py-16">
      <h1 className="text-2xl font-semibold">Configuration requise</h1>
      <p className="mt-3 text-muted">
        L&apos;authentification et les données reposent sur Supabase, qui n&apos;est pas encore configuré pour cette
        instance.
      </p>
      <ol className="mt-6 grid list-decimal gap-2 pl-5">
        <li>Créez un projet Supabase (région UE).</li>
        <li>
          Appliquez les migrations du dossier <code className="rounded bg-sunken px-1">supabase/migrations</code>.
        </li>
        <li>
          Copiez <code className="rounded bg-sunken px-1">.env.example</code> en{" "}
          <code className="rounded bg-sunken px-1">.env.local</code> et renseignez l&apos;URL et la clé publishable.
        </li>
        <li>Redémarrez le serveur.</li>
      </ol>
      <p className="mt-6 text-sm text-muted">Le détail figure dans le README, section « Supabase ».</p>
    </div>
  );
}
