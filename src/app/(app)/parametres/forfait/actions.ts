"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { checkoutParams } from "@/server/billing/checkout";
import { getStripe } from "@/server/billing/stripe";
import type { FormState } from "@/lib/validation/auth";

export async function startCheckout(_prev: FormState, fd: FormData): Promise<FormState> {
  const plan = z.enum(["pro", "premium"]).safeParse(fd.get("plan"));
  if (!plan.success) return { status: "error", message: "Forfait inconnu." };
  if (fd.get("waiver") !== "on") {
    return { status: "error", fieldErrors: { waiver: "Cochez cette case pour accéder immédiatement au forfait." } };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/parametres/forfait");

  const [{ data: enabled }, { data: row }] = await Promise.all([
    supabase.rpc("feature_enabled", { p_key: "checkout" }),
    supabase.from("plans").select("code, name, price_cents, duration_days, active").eq("code", plan.data).maybeSingle(),
  ]);
  if (!enabled) return { status: "error", message: "L'achat de forfaits est momentanément suspendu." };
  if (!row?.active || !row.duration_days || row.price_cents <= 0) return { status: "error", message: "Ce forfait n'est pas disponible." };

  const stripe = getStripe();
  if (!stripe) return { status: "error", message: "Le paiement n'est pas encore configuré sur cette instance." };

  let url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create(
      checkoutParams({
        plan: { code: plan.data, name: row.name, priceCents: row.price_cents, durationDays: row.duration_days },
        userId: user.id,
        email: user.email ?? null,
        siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
        waiverAt: new Date(),
      }),
    );
    url = session.url;
  } catch {
    return { status: "error", message: "Le service de paiement n'a pas répondu. Réessayez dans quelques instants." };
  }
  if (!url) return { status: "error", message: "Le service de paiement n'a pas répondu." };
  redirect(url);
}
