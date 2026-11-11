import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resumeProfileSchema } from "@/lib/validation/resume-profile";
import { renderResumePdf } from "@/server/cv/render-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // RLS : seule une version de l'utilisateur est lisible.
  const { data: version } = await supabase
    .from("resume_versions")
    .select("version_no, label, content, resumes(title)")
    .eq("id", id)
    .maybeSingle();
  if (!version) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const parsed = resumeProfileSchema.safeParse(version.content);
  if (!parsed.success) return NextResponse.json({ error: "Version illisible" }, { status: 422 });

  const resume = Array.isArray(version.resumes) ? version.resumes[0] : version.resumes;
  const title = `${resume?.title ?? "CV"} — ${version.label ?? `version ${version.version_no}`}`;
  const pdf = await renderResumePdf(parsed.data, { title });
  const filename = `${(parsed.data.identity.fullName ?? resume?.title ?? "cv").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "cv"}-v${version.version_no}.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
