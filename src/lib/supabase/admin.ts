import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
import { serverEnv } from "@/server/env";

/**
 * Client service role : contourne la RLS. Réservé aux écritures que l'utilisateur ne peut
 * pas faire lui-même (usage IA, audit, jobs). Ne jamais l'utiliser pour lire des données
 * personnelles à la place du client utilisateur.
 */
export function createAdminClient() {
  const config = supabaseConfig();
  const key = serverEnv().SUPABASE_SECRET_KEY;
  if (!config || !key) return null;
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
