import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Explorer les entreprises" };

export default function Page() {
  return (
    <ComingSoon
      href="/entreprises"
      description="Préparez votre approche de chaque entreprise ciblée."
      planned={[
        "Fiche entreprise normalisée (domaine officiel, secteur, services)",
        "Recherche assistée de collaborateurs par métier et service",
        "Pages officielles de l'entreprise que vous consultez",
      ]}
    />
  );
}
