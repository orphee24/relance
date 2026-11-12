"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Columns3, Rows3, Search } from "lucide-react";
import { Input } from "@/components/ui/field";
import { APPLICATION_STATUS_LABELS, PIPELINE_STAGES } from "@/config/domain";
import { CHANNELS, listHref, SORTS, type ListFilters } from "@/lib/validation/application";
import { cn } from "@/lib/utils";
import { Select } from "./form-bits";

export function FilterBar({ filters }: { filters: ListFilters }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const go = (patch: Partial<ListFilters>) => router.push(listHref(patch, filters));

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <form
          role="search"
          className="relative min-w-0 flex-1 basis-56"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <Input aria-label="Rechercher une entreprise, un poste ou un lieu" placeholder="Entreprise, poste, lieu…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" maxLength={100} />
        </form>
        <label className="grid gap-1 text-xs text-muted">
          Canal
          <Select value={filters.channel ?? ""} onChange={(e) => go({ channel: (e.target.value || null) as ListFilters["channel"] })} className="h-9 w-48">
            <option value="">Tous les canaux</option>
            {Object.entries(CHANNELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        {filters.view === "table" ? (
          <label className="grid gap-1 text-xs text-muted">
            Trier par
            <Select value={filters.sort} onChange={(e) => go({ sort: e.target.value as ListFilters["sort"] })} className="h-9 w-44">
              {Object.entries(SORTS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <div role="group" aria-label="Affichage" className="inline-flex rounded-control border border-line p-0.5">
          {(
            [
              ["table", "Liste", Rows3],
              ["kanban", "Kanban", Columns3],
            ] as const
          ).map(([view, label, Icon]) => (
            <Link
              key={view}
              href={listHref({ view }, filters)}
              aria-current={filters.view === view ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-sm text-muted hover:text-ink",
                filters.view === view && "bg-sunken font-medium text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {filters.view === "table" ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par étape">
          {PIPELINE_STAGES.map((stage) => {
            const active = stage.statuses.every((s) => filters.statuses.includes(s));
            const statuses = active
              ? filters.statuses.filter((s) => !stage.statuses.includes(s))
              : Array.from(new Set([...filters.statuses, ...stage.statuses]));
            return (
              <Link
                key={stage.key}
                href={listHref({ statuses }, filters)}
                aria-pressed={active}
                title={stage.statuses.map((s) => APPLICATION_STATUS_LABELS[s]).join(", ")}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  active ? "border-emerald bg-emerald-wash font-medium text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {stage.label}
              </Link>
            );
          })}
          {filters.statuses.length || filters.q || filters.channel ? (
            <Link href={listHref({ statuses: [], q: "", channel: null }, filters)} className="ml-1 text-sm text-emerald hover:underline">
              Effacer les filtres
            </Link>
          ) : null}
          <Link href={listHref({ archived: !filters.archived }, filters)} className="ml-auto text-sm text-muted hover:text-ink">
            {filters.archived ? "Voir les candidatures actives" : "Voir les archives"}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
