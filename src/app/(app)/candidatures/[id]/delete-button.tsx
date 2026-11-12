"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";

export function DeleteApplicationButton({ id, action }: { id: string; action: (fd: FormData) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 />
        Supprimer
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmer la suppression">
      <input type="hidden" name="id" value={id} />
      <span className="text-sm text-muted">Supprimer définitivement, avec son historique ?</span>
      <SubmitButton variant="danger" size="sm" pendingLabel="Suppression…" className="w-auto">
        Supprimer
      </SubmitButton>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(false)}>
        Annuler
      </Button>
    </form>
  );
}
