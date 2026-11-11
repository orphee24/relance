import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Mes entretiens" };

export default function Page() {
  return (
    <ComingSoon
      href="/entretiens"
      description="Préparez vos entretiens à partir du poste visé."
      planned={[
        "Questions probables et préparation de réponses STAR",
        "Simulation écrite et retours personnalisés",
        "Questions à poser et préparation à la négociation salariale",
      ]}
    />
  );
}
