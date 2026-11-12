"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { firstErrors, type FormState } from "@/lib/validation/auth";

const intOrNull = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      ctx.addIssue({ code: "custom", message: "Entier positif, ou vide pour illimité." });
      return z.NEVER;
    }
    return n;
  });

const planSchema = z.object({
  code: z.enum(["free", "pro", "premium"]),
  price_euros: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        ctx.addIssue({ code: "custom", message: "Prix entre 0 et 1 000 €." });
        return z.NEVER;
      }
      return Math.round(n * 100);
    }),
  offer_analyses: intOrNull,
  tracked_applications: intOrNull,
  ai_follow_ups: intOrNull,
  network_searches_per_day: z.coerce.number().int().min(0).max(1000),
  interview_coach: z.union([z.literal("on"), z.literal("")]).transform((v) => v === "on"),
  active: z.union([z.literal("on"), z.literal("")]).transform((v) => v === "on"),
});

export async function updatePlan(_prev: FormState, fd: FormData): Promise<FormState> {
  const keys = ["code", "price_euros", "offer_analyses", "tracked_applications", "ai_follow_ups", "network_searches_per_day", "interview_coach", "active"];
  const parsed = planSchema.safeParse(Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")])));
  if (!parsed.success) return { status: "error", fieldErrors: firstErrors(parsed.error) };
  const { code, price_euros, active, ...quotas } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan", { p_code: code, p_price_cents: price_euros, p_quotas: quotas, p_active: active });
  if (error) return { status: "error", message: error.code === "42501" ? "Accès réservé aux administrateurs." : "Modification refusée (le forfait Free doit rester gratuit et actif)." };
  revalidatePath("/admin");
  revalidatePath("/parametres/forfait");
  return { status: "success", message: "Forfait mis à jour. Les nouveaux quotas s'appliquent immédiatement ; le prix aux prochains achats." };
}

export async function setFlag(fd: FormData) {
  const key = z.string().min(1).max(60).safeParse(fd.get("key"));
  if (!key.success) return;
  const supabase = await createClient();
  await supabase.rpc("admin_set_flag", { p_key: key.data, p_enabled: fd.get("enabled") === "1" });
  revalidatePath("/admin");
}
