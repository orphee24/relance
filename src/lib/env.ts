import { z } from "zod";

/**
 * Variables publiques (exposées au navigateur). Les secrets serveur sont lus
 * uniquement dans src/server via `serverEnv()`.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: z.enum(["true", "false"]).default("false"),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED || undefined,
});

if (!parsed.success) {
  throw new Error(`Configuration invalide : ${z.prettifyError(parsed.error)}`);
}

export const publicEnv = parsed.data;

export function supabaseConfig(): { url: string; key: string } | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = publicEnv;
  return url && key ? { url, key } : null;
}

export const isSupabaseConfigured = () => supabaseConfig() !== null;
export const isGoogleAuthEnabled = () => publicEnv.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
