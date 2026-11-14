import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Export RGPD : toutes les données de l'utilisateur connecté (RLS appliquée côté base). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "Export indisponible" }, { status: 500 });

  // Journal d'audit : qui a exporté, quand (aucun contenu).
  await createAdminClient()
    ?.from("audit_logs")
    .insert({ actor_user_id: user.id, action: "data_exported", target_type: "user", target_id: user.id });

  const filename = `relance-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify({ account: { id: user.id, email: user.email }, ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
