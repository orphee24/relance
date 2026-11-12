import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PLANS, type PlanCode } from "@/config/plans";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const [{ data: profile }, { data: plan }, { data: isAdmin }] = await Promise.all([
    supabase.from("user_profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("current_plan"),
    supabase.rpc("is_admin"),
  ]);

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Mon compte";
  const planCode = (typeof plan === "string" && plan in DEFAULT_PLANS ? plan : "free") as PlanCode;

  return (
    <div className="lg:flex">
      <Sidebar displayName={displayName} email={user.email ?? ""} planLabel={DEFAULT_PLANS[planCode].name} isAdmin={isAdmin === true} />
      <main id="contenu" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
