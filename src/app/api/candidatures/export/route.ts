import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseListFilters } from "@/lib/validation/application";
import { applicationsToCsv } from "@/server/applications/export";
import { listApplications } from "@/server/applications/query";

export const dynamic = "force-dynamic";

/** Export CSV des candidatures (filtres de la liste acceptés en paramètres). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const filters = { ...parseListFilters(Object.fromEntries(request.nextUrl.searchParams)), view: "table" as const };
  const { rows, error } = await listApplications(supabase, filters);
  if (error) return NextResponse.json({ error: "Export indisponible" }, { status: 500 });

  return new NextResponse(applicationsToCsv(rows.map((r) => ({ ...r, coverage_score: r.coverage }))), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relance-candidatures-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
