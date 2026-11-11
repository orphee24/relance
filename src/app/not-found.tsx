import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="contenu" className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Cette page n&apos;existe pas.</h1>
      <p className="text-muted">Le lien est peut-être incomplet ou la page a été déplacée.</p>
      <Button asChild className="justify-self-start">
        <Link href="/">Revenir à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
