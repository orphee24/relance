import { signInWithGoogle } from "@/app/(auth)/actions";
import { GoogleIcon, SubmitButton } from "./form-parts";

export function GoogleButton({ next, label = "Continuer avec Google" }: { next?: string; label?: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next ?? ""} />
      <SubmitButton variant="secondary" pendingLabel="Redirection vers Google…">
        <GoogleIcon />
        {label}
      </SubmitButton>
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-faint" role="separator">
      <span className="h-px flex-1 bg-line" />
      ou avec votre email
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
