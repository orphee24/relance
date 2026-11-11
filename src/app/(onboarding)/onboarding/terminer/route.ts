import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Fin de l'onboarding après la vérification du CV (idempotent). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/connexion", request.nextUrl.origin));

  await supabase
    .from("user_profiles")
    .update({ onboarding_step: 5, onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarding_completed_at", null);

  return NextResponse.redirect(new URL("/tableau-de-bord?bienvenue=1", request.nextUrl.origin));
}
