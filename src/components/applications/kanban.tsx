"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveApplication } from "@/app/(app)/candidatures/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/config/domain";
import { requiresExplicitConfirmation, waitingInfo } from "@/server/applications/insights";
import { cn } from "@/lib/utils";
import { StatusDot } from "./status";
import { DueLabel } from "./due-label";

export interface BoardItem {
  id: string;
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
  applied_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  coverage: number | null;
}

interface Pending {
  id: string;
  to: ApplicationStatus;
}

export function KanbanBoard({ items }: { items: BoardItem[] }) {
  const [optimistic, applyMove] = useOptimistic(items, (state, m: Pending) =>
    state.map((i) => (i.id === m.id ? { ...i, status: m.to } : i)),
  );
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ApplicationStatus | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const commit = (m: Pending, note?: string) => {
    const item = optimistic.find((i) => i.id === m.id);
    if (!item || item.status === m.to) return;
    setError(null);
    startTransition(async () => {
      applyMove(m);
      const r = await moveApplication(m.id, m.to, note);
      if (!r.ok) setError(r.message ?? "Le statut n'a pas pu être modifié.");
      else setAnnounce(`${item.job_title} déplacée vers ${APPLICATION_STATUS_LABELS[m.to]}.`);
    });
  };

  const request = (id: string, to: ApplicationStatus) => {
    if (requiresExplicitConfirmation(to)) setConfirm({ id, to });
    else commit({ id, to });
  };

  return (
    <div className="grid gap-3">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="text-sm text-muted">
        Glissez une carte vers une autre colonne, ou changez son statut avec le menu de la carte. Faites défiler horizontalement pour voir toutes les étapes.
      </p>

      <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" role="region" aria-label="Tableau Kanban des candidatures" tabIndex={0}>
        <ol className="flex snap-x gap-3">
          {APPLICATION_STATUSES.map((status) => {
            const cards = optimistic.filter((i) => i.status === status);
            return (
              <li
                key={status}
                aria-label={`${APPLICATION_STATUS_LABELS[status]}, ${cards.length} candidature${cards.length > 1 ? "s" : ""}`}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOver(status);
                }}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData("text/plain") || dragging;
                  if (id) request(id, status);
                  setDragging(null);
                }}
                className={cn(
                  "flex w-64 shrink-0 snap-start flex-col rounded-panel border border-line bg-sunken/60 transition-colors",
                  over === status && "border-emerald bg-emerald-wash",
                )}
              >
                <h3 className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium">
                  <StatusDot status={status} />
                  <span className="flex-1">{APPLICATION_STATUS_LABELS[status]}</span>
                  <span className="tabular-nums text-muted">{cards.length}</span>
                </h3>
                <ul className="grid min-h-16 content-start gap-2 px-2 pb-2">
                  {cards.map((c) => {
                    const waiting = waitingInfo(c.status, c.applied_at);
                    return (
                      <li
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragging(c.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        className={cn(
                          "grid cursor-grab gap-2 rounded-control border border-line bg-surface p-3 text-sm active:cursor-grabbing",
                          dragging === c.id && "opacity-50",
                        )}
                      >
                        <div className="min-w-0">
                          <Link href={`/candidatures/${c.id}`} className="font-medium hover:text-emerald hover:underline">
                            {c.job_title}
                          </Link>
                          <p className="truncate text-muted">{c.company_name}</p>
                        </div>
                        {waiting || c.next_action_at || c.coverage != null ? (
                          <div className="grid gap-1 text-xs text-muted">
                            {waiting ? <span className={waiting.tone === "attention" ? "text-ink" : undefined}>{waiting.label}</span> : null}
                            {c.next_action_at ? <DueLabel at={c.next_action_at} label={c.next_action} /> : null}
                            {c.coverage != null ? <span className="tabular-nums">Couverture {Math.round(c.coverage)} %</span> : null}
                          </div>
                        ) : null}
                        <label className="flex items-center gap-2 text-xs text-muted">
                          <span className="sr-only">Statut de {c.job_title}</span>
                          <select
                            value={c.status}
                            onChange={(e) => request(c.id, e.target.value as ApplicationStatus)}
                            className="h-7 w-full rounded-control border border-line bg-surface px-1.5 text-xs text-ink focus-visible:border-emerald focus-visible:outline-none"
                          >
                            {APPLICATION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {APPLICATION_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>

      {confirm ? (
        <ConfirmDialog
          title={`Marquer comme « ${APPLICATION_STATUS_LABELS[confirm.to]} » ?`}
          text={requiresExplicitConfirmation(confirm.to) ?? ""}
          onCancel={() => setConfirm(null)}
          onConfirm={(note) => {
            commit(confirm, note);
            setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function ConfirmDialog({
  title,
  text,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  onCancel: () => void;
  onConfirm: (note?: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" className="grid w-full max-w-md gap-4 rounded-panel border border-line bg-surface p-5">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-text" className="text-sm text-muted">
          {text}
        </p>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Ce que l&apos;entreprise vous a indiqué (facultatif)</span>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base focus-visible:border-emerald focus-visible:outline-none sm:text-sm"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(note.trim() || undefined)}>Confirmer</Button>
        </div>
      </div>
    </div>
  );
}
