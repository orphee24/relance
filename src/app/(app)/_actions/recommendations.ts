"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureTodayRecommendations } from "@/server/recommendations/load";

export async function setRecommendationStatus(fd: FormData) {
  const id = z.uuid().safeParse(fd.get("id"));
  const status = z.enum(["done", "dismissed", "pending"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return;
  const supabase = await createClient();
  await supabase
    .from("recommendations")
    .update({ status: status.data, acted_at: status.data === "pending" ? null : new Date().toISOString() })
    .eq("id", id.data);
  revalidatePath("/actions");
  revalidatePath("/tableau-de-bord");
}

export async function refreshRecommendations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await ensureTodayRecommendations(supabase, { force: true });
  revalidatePath("/actions");
  revalidatePath("/tableau-de-bord");
}
