import { NextResponse } from "next/server";
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

  const filename = `relance-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify({ account: { id: user.id, email: user.email }, ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
