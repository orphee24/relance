"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";

export async function requestAccountDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "SUPPRIMER") {
    return { status: "error", fieldErrors: { confirm: "Saisissez SUPPRIMER pour confirmer." } };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };

  const { error } = await supabase.from("deletion_requests").insert({ user_id: user.id });
  if (error && error.code !== "23505") {
    return { status: "error", message: "La demande n'a pas pu être enregistrée. Réessayez." };
  }
  revalidatePath("/parametres");
  return { status: "success", message: "Votre demande de suppression est enregistrée." };
}
