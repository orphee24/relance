"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteResume } from "@/app/(app)/cv/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";

/** Suppression en deux temps : on confirme explicitement une action irréversible. */
export function DeleteResumeButton({ resumeId, title }: { resumeId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Supprimer ${title}`}>
        <Trash2 />
        Supprimer
      </Button>
    );
  }
  return (
    <form action={deleteResume} className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmer la suppression">
      <input type="hidden" name="resumeId" value={resumeId} />
      <span className="text-sm text-muted">Supprimer définitivement ce CV et ses versions ?</span>
      <SubmitButton variant="danger" size="sm" pendingLabel="Suppression…" className="w-auto">
        Supprimer
      </SubmitButton>
      <Button variant="ghost" size="sm" type="button" onClick={() => setConfirming(false)}>
        Annuler
      </Button>
    </form>
  );
}
