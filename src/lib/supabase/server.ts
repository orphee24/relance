import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";

/** Client Supabase côté serveur, lié aux cookies de la requête (RLS en tant qu'utilisateur). */
export async function createClient() {
  const config = supabaseConfig();
  if (!config) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : le middleware se charge du rafraîchissement.
        }
      },
    },
  });
}

/** Utilisateur authentifié, vérifié auprès du serveur Auth (jamais `getSession()` pour autoriser). */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase n'est pas configuré (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
    this.name = "SupabaseNotConfiguredError";
  }
}
