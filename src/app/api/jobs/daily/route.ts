import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDeletionRequests } from "@/server/jobs/deletion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Tâche quotidienne (Vercel Cron envoie « Authorization: Bearer $CRON_SECRET ») :
 * suppressions de comptes demandées, expiration des forfaits, purge des fiches de tiers expirées.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Clé serveur Supabase absente" }, { status: 503 });

  const deletions = await processDeletionRequests(admin);
  const { data: maintenance, error } = await admin.rpc("run_daily_maintenance");
  if (error) console.error("[jobs] maintenance", error.message);

  const status = deletions.failed > 0 || error ? 500 : 200;
  return NextResponse.json({ deletions, maintenance: maintenance ?? null }, { status, headers: { "Cache-Control": "no-store" } });
}
