import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { DEFAULT_PLANS, type PlanCode } from "@/config/plans";
import { createClient } from "@/lib/supabase/server";
import { DeletionForm } from "./deletion-form";

export const metadata: Metadata = { title: "Paramètres" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: plan }, { data: pending }] = await Promise.all([
    supabase.rpc("current_plan"),
    supabase.from("deletion_requests").select("requested_at").in("status", ["pending", "processing"]).maybeSingle(),
  ]);
  const planDef = DEFAULT_PLANS[(typeof plan === "string" && plan in DEFAULT_PLANS ? plan : "free") as PlanCode];

  return (
    <>
      <PageHeader title="Paramètres" description="Votre compte, votre forfait et vos données." />
      <div className="grid gap-4">
        <Panel>
          <PanelHeader title="Compte" />
          <PanelBody className="grid gap-4 text-sm">
            <Row label="Adresse email">{user?.email}</Row>
            <Row label="Connexion">{user?.app_metadata?.provider === "google" ? "Google" : "Email et mot de passe"}</Row>
            <Row label="Thème">
              <ThemeToggle />
            </Row>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Forfait" description="Les forfaits payants durent 30 jours et ne sont jamais renouvelés automatiquement." />
          <PanelBody className="text-sm">
            <Row label="Forfait actuel">{planDef.name}</Row>
            <Link href="/parametres/forfait" className="mt-3 inline-block font-medium text-emerald hover:underline">
              Voir mon forfait, ma consommation et mes paiements
            </Link>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Mes données" description="Vous pouvez à tout moment récupérer ou supprimer vos données (RGPD)." />
          <PanelBody className="grid gap-6">
            <div className="grid gap-2">
              <p className="text-sm">
                Téléchargez l&apos;ensemble de vos données (profil, CV, candidatures, contacts, messages, consentements) au format JSON.
              </p>
              <Button variant="secondary" asChild className="justify-self-start">
                <a href="/api/compte/export" download>
                  <Download />
                  Exporter mes données
                </a>
              </Button>
            </div>
            <div className="grid gap-3 border-t border-line pt-5">
              <p className="font-medium">Supprimer mon compte</p>
              <p className="max-w-prose text-sm text-muted">
                Votre compte et toutes vos données personnelles seront supprimés définitivement. Les justificatifs de
                paiement sont conservés de façon anonymisée pour nos obligations comptables.
              </p>
              {pending ? (
                <Alert tone="info" title="Demande de suppression enregistrée">
                  Demande reçue le {dateFmt.format(new Date(pending.requested_at))}.
                </Alert>
              ) : (
                <DeletionForm />
              )}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}
