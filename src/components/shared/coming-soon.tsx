import { Construction } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";
import { NAV_ITEMS } from "@/config/navigation";

/** Écran d'une fonctionnalité non encore livrée : on le dit clairement, sans données fictives. */
export function ComingSoon({ href, description, planned }: { href: string; description: string; planned: string[] }) {
  const item = NAV_ITEMS.find((i) => i.href === href);
  return (
    <>
      <PageHeader title={item?.label ?? "Bientôt disponible"} description={description} />
      <Panel>
        <PanelBody className="grid gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-control bg-sunken text-muted">
              <Construction className="size-4" aria-hidden="true" />
            </span>
            <p className="font-medium">En cours de construction — phase {item?.phase} de la feuille de route.</p>
          </div>
          <div>
            <p className="text-sm text-muted">Ce que contiendra cet écran :</p>
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm">
              {planned.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </PanelBody>
      </Panel>
    </>
  );
}
