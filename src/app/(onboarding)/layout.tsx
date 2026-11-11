import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo href="/tableau-de-bord" />
        <ThemeToggle />
      </header>
      <main id="contenu" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-8">
        {children}
      </main>
    </div>
  );
}
