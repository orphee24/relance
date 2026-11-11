import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Statistiques" };

export default function Page() {
  return (
    <ComingSoon
      href="/statistiques"
      description="Mesurez ce qui fonctionne dans votre recherche."
      planned={[
        "Taux de réponse et d'entretien dans le temps",
        "Comparaison par canal de candidature",
        "Actions réseau et introductions obtenues",
        "Corrélations présentées comme telles, jamais comme des causes",
      ]}
    />
  );
}
