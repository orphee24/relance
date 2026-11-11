import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Redirige vers une URL signée de courte durée (60 s) du fichier d'origine. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: resume } = await supabase.from("resumes").select("storage_path, original_filename").eq("id", id).maybeSingle();
  if (!resume?.storage_path) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(resume.storage_path, 60, { download: resume.original_filename ?? true });
  if (error || !data) return NextResponse.json({ error: "Fichier indisponible" }, { status: 502 });
  return NextResponse.redirect(data.signedUrl);
}
