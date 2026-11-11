import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Compte">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/connexion">Se connecter</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/inscription">Créer un compte</Link>
          </Button>
        </nav>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-8">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted sm:px-8">
        <span>© {new Date().getFullYear()} Relance</span>
        <Link href="/cgu" className="hover:text-ink">Conditions d&apos;utilisation</Link>
        <Link href="/confidentialite" className="hover:text-ink">Confidentialité</Link>
      </footer>
    </div>
  );
}
