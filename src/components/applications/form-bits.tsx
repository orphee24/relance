"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Décalage horaire du navigateur, pour interpréter les dates saisies dans le fuseau de l'utilisateur. */
export function TzInput() {
  const [offset, setOffset] = useState("0");
  useEffect(() => setOffset(String(new Date().getTimezoneOffset())), []);
  return <input type="hidden" name="tz" value={offset} />;
}

export const selectClass =
  "h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/25 aria-[invalid=true]:border-danger sm:text-sm";

export const textareaClass =
  "min-h-24 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/25 aria-[invalid=true]:border-danger sm:text-sm";

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(selectClass, props.className)} />;
}

/** Convertit un instant ISO en valeur d'<input type="datetime-local"> dans le fuseau du navigateur. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
