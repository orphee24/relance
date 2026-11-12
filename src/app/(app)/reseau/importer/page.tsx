import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ImportForm } from "@/components/network/forms";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Importer mes relations" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Importer mes relations" description="Retrouvez vos relations existantes quand vous ciblez leur entreprise." />
      <div className="grid max-w-3xl gap-4">
        <Panel>
          <PanelBody>
            <ImportForm />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Comment obtenir le fichier" />
          <PanelBody className="grid gap-3 text-sm">
            <ol className="grid list-decimal gap-1.5 pl-5">
              <li>Sur LinkedIn : Préférences › Confidentialité des données › Obtenir une copie de vos données.</li>
              <li>Choisissez « Relations » (Connections), puis téléchargez l&apos;archive reçue par email.</li>
              <li>Importez ici le fichier « Connections.csv ».</li>
            </ol>
            <p className="text-muted">
              Un fichier CSV avec les colonnes Prénom, Nom, Entreprise et Poste fonctionne aussi. Relance conserve le nom, la fonction,
              l&apos;entreprise et le lien du profil. Les adresses email sont ignorées. Les doublons sont détectés et le consentement est
              enregistré avec la date.
            </p>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
