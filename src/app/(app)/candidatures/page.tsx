import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Mes candidatures" };

export default function Page() {
  return (
    <ComingSoon
      href="/candidatures"
      description="Suivez chaque candidature, de l'analyse à la réponse."
      planned={[
        "Vue tableau et vue Kanban",
        "Statuts, historique et rappels",
        "Recherche, filtres, tri et détection des doublons",
        "Onglet « Personnes à contacter » sur chaque candidature",
        "Export CSV",
      ]}
    />
  );
}
