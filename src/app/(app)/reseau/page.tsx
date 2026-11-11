import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Mon réseau" };

export default function Page() {
  return (
    <ComingSoon
      href="/reseau"
      description="Les personnes que vous avez identifiées et vos échanges avec elles."
      planned={[
        "Fiches avec source, date de vérification et niveau de fiabilité",
        "Score de pertinence expliqué critère par critère",
        "Statuts de contact, dont « Ne plus contacter »",
        "Import de vos propres contacts, avec votre consentement",
      ]}
    />
  );
}
