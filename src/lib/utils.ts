import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFormatter = new Intl.NumberFormat("fr-FR");
const percentFormatter = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

export function formatNumber(n: number) {
  return numberFormatter.format(n);
}

/** Taux en % ou null si le dénominateur est nul (on n'affiche jamais 0 % par défaut). */
export function formatRate(numerator: number, denominator: number): string | null {
  if (denominator <= 0) return null;
  return percentFormatter.format(numerator / denominator);
}

/**
 * N'accepte que des chemins internes (« /quelque-chose »), jamais « //domaine » ni
 * d'URL absolue : protège contre les redirections ouvertes.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/tableau-de-bord"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://relance.local");
    if (url.origin !== "http://relance.local") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
