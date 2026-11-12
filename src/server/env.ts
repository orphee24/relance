import "server-only";
import { z } from "zod";

/** Variables serveur (secrets). Jamais importées côté client. */
const schema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  AI_PROVIDER: z.enum(["anthropic", "none"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  AI_MODEL: z.string().min(3).default("claude-sonnet-5-5"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(45_000),
  /** Tarifs en euros par million de jetons, pour l'estimation des coûts (à renseigner d'après la grille du fournisseur). */
  AI_PRICE_INPUT_EUR_PER_MTOK: z.coerce.number().min(0).default(0),
  AI_PRICE_OUTPUT_EUR_PER_MTOK: z.coerce.number().min(0).default(0),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, { error: "Clé Stripe invalide" }).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/, { error: "Secret de webhook Stripe invalide" }).optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(
    Object.fromEntries(Object.keys(schema.shape).map((k) => [k, process.env[k] || undefined])),
  );
  if (!parsed.success) throw new Error(`Configuration serveur invalide : ${z.prettifyError(parsed.error)}`);
  cached = parsed.data;
  return cached;
}

export const isAiConfigured = () => {
  const env = serverEnv();
  return env.AI_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY);
};
