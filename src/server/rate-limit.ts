import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateRule {
  /** Nom de la règle (préfixe de clé). */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** Règles de limitation : volontairement larges pour un usage normal, bloquantes pour un robot. */
export const RATE_RULES = {
  signInIp: { name: "signin-ip", limit: 20, windowSeconds: 600 },
  signInEmail: { name: "signin-email", limit: 8, windowSeconds: 600 },
  signUpIp: { name: "signup-ip", limit: 6, windowSeconds: 3600 },
  emailIp: { name: "email-ip", limit: 6, windowSeconds: 3600 },
  aiUser: { name: "ai-user", limit: 40, windowSeconds: 600 },
} satisfies Record<string, RateRule>;

/** Clé pseudonyme : jamais d'IP ou d'adresse email en clair dans la base. */
export function rateKey(rule: RateRule, identifier: string): string {
  const digest = createHash("sha256").update(`relance:${rule.name}:${identifier.trim().toLowerCase()}`).digest("hex");
  return `${rule.name}:${digest.slice(0, 40)}`;
}

/** Adresse IP du client telle que transmise par l'hébergeur (Vercel renseigne x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Enregistre un appel ; renvoie false si la limite est dépassée.
 * Sans clé serveur ou en cas d'erreur de la base, l'appel est autorisé (on ne bloque pas
 * un utilisateur légitime pour un incident d'infrastructure) et l'incident est journalisé.
 */
export async function allow(rule: RateRule, identifier: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return true;
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: rateKey(rule, identifier),
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] indisponible", error.code);
    return true;
  }
  return data === true;
}

export const RATE_LIMIT_MESSAGE = "Trop de tentatives en peu de temps. Patientez quelques minutes avant de réessayer.";
