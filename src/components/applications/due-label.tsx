"use client";

import { useEffect, useState } from "react";
import { dueState } from "@/server/applications/insights";
import { cn } from "@/lib/utils";

const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fmtTime = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Échéance affichée dans le fuseau du navigateur (calculée après montage). */
export function DueLabel({ at, label, className }: { at: string; label?: string | null; className?: string }) {
  const [text, setText] = useState<{ when: string; state: ReturnType<typeof dueState> } | null>(null);
  useEffect(() => {
    const d = new Date(at);
    const state = dueState(at);
    const when =
      state === "today" ? `aujourd'hui ${fmtTime.format(d)}` : state === "overdue" ? `en retard (${fmt.format(d)})` : fmt.format(d);
    setText({ when, state });
  }, [at]);
  return (
    <span className={cn(text?.state === "overdue" && "font-medium text-danger", text?.state === "today" && "font-medium text-ink", className)}>
      {label ? `${label} · ` : ""}
      {text?.when ?? "…"}
    </span>
  );
}
