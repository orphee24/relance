"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, UploadCloud } from "lucide-react";
import { uploadResume } from "@/app/(app)/cv/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Alert } from "@/components/ui/misc";
import type { FormState } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

export function CvUploadForm({ next, submitLabel = "Importer et analyser" }: { next?: string; submitLabel?: string }) {
  const [state, action] = useActionState(uploadResume, { status: "idle" } as FormState);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const error = state.fieldErrors?.file;

  return (
    <form action={action} className="grid gap-4">
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label
        htmlFor="cv-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped && input.current) {
            const dt = new DataTransfer();
            dt.items.add(dropped);
            input.current.files = dt.files;
            setFile(dropped);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong bg-surface px-6 py-10 text-center transition-colors",
          "hover:border-emerald/60 hover:bg-sunken focus-within:border-emerald",
          dragging && "border-emerald bg-emerald-wash",
          error && "border-danger",
        )}
      >
        {file ? (
          <>
            <FileText className="size-7 text-emerald" aria-hidden="true" />
            <span className="font-medium">{file.name}</span>
            <span className="text-sm text-muted">
              {formatSize(file.size)} · <span className="text-emerald underline-offset-2 hover:underline">Changer de fichier</span>
            </span>
          </>
        ) : (
          <>
            <UploadCloud className="size-7 text-muted" aria-hidden="true" />
            <span className="font-medium">Déposez votre CV ici ou choisissez un fichier</span>
            <span className="text-sm text-muted">PDF ou Word (.docx), 5 Mo maximum</span>
          </>
        )}
        <input
          ref={input}
          id="cv-file"
          name="file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "cv-file-error" : "cv-file-hint"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {error ? (
        <p id="cv-file-error" className="-mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : (
        <p id="cv-file-hint" className="-mt-2 text-xs text-muted">
          Votre fichier reste privé. Relance en extrait le texte pour vous proposer un profil que vous vérifiez ensuite.
        </p>
      )}

      <SubmitButton pendingLabel="Analyse du CV en cours…" disabled={!file} className="w-full sm:w-auto sm:justify-self-start">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
