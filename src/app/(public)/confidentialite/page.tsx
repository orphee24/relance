import type { Metadata } from "next";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function Page() {
  return (
    <article className="max-w-2xl py-16">
      <h1 className="text-2xl font-semibold">Politique de confidentialité</h1>
      <p className="mt-4 rounded-control border border-line bg-sunken p-4 text-sm">
        Document en cours de rédaction. Il sera validé juridiquement avant l&apos;ouverture du service au public.
      </p>
    </article>
  );
}
