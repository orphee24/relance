import type { Metadata } from "next";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Mes CV" };

export default function Page() {
  return (
    <ComingSoon
      href="/cv"
      description="Votre profil professionnel et les versions de votre CV."
      planned={[
        "Import PDF ou DOCX",
        "Extraction du profil, que vous vérifiez avant tout usage",
        "Versions adaptées par offre, sans compétence inventée",
        "Export PDF",
      ]}
    />
  );
}
