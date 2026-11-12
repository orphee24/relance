import { ExternalLink } from "lucide-react";
import { buildSearchLinks } from "@/server/network/sources";

/** Recherche assistée : liens ouverts par l'utilisateur, dans ses propres comptes. Relance ne récupère rien. */
export function SearchLinks({ company, jobTitle, domain }: { company: string; jobTitle: string; domain?: string | null }) {
  const links = buildSearchLinks({ company, jobTitle, domain });
  const groups = Array.from(new Set(links.map((l) => l.label)));
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Ces recherches s&apos;ouvrent dans un nouvel onglet, avec vos propres comptes. Relance ne lance aucune requête et ne récupère
        aucun résultat : ajoutez ensuite les personnes pertinentes que vous avez consultées.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const items = links.filter((l) => l.label === g);
          return (
            <li key={g} className="grid content-start gap-2 rounded-control border border-line p-3">
              <p className="text-sm font-medium">{g}</p>
              <p className="text-xs text-muted">{items[0]!.purpose}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {items.map((l) => (
                  <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-medium text-emerald hover:underline">
                    {l.engine}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">(nouvel onglet)</span>
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
