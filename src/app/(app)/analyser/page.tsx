import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Analyser une offre" };

export default function Page() {
  return (
    <ComingSoon
      href="/analyser"
      description="Comparez une offre à votre CV, critère par critère."
      planned={[
        "Extraction des critères obligatoires et souhaitables",
        "Estimation interne de couverture, expliquée (ce n'est pas un score ATS)",
        "Compétences démontrées et non démontrées, avec les extraits qui le prouvent",
        "Suggestions d'amélioration à accepter ou refuser une par une",
      ]}
    />
  );
}
