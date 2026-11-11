import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Mes actions" };

export default function Page() {
  return (
    <ComingSoon
      href="/actions"
      description="Ce qu'il est utile de faire aujourd'hui, et pourquoi."
      planned={[
        "Trois actions prioritaires par jour, justifiées",
        "Diagnostic des candidatures sans réponse : faits, hypothèses, inconnus",
        "Relances limitées pour éviter les sollicitations excessives",
      ]}
    />
  );
}
