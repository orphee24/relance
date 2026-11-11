import { Logo } from "@/components/brand";
import { ConfidenceLegend } from "@/components/ui/confidence";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
      </div>

      <aside className="relative hidden overflow-hidden bg-emerald-strong text-white lg:flex lg:flex-col lg:justify-end lg:p-12 dark:bg-emerald-wash">
        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-tight">Ne postulez plus dans le vide.</p>
          <p className="mt-3 text-base text-white/75 dark:text-muted">
            Relance analyse vos candidatures, vous aide à trouver les bonnes personnes dans chaque entreprise et vous
            dit quoi faire aujourd&apos;hui. Chaque information indique son niveau de fiabilité.
          </p>
          <div className="mt-8 rounded-panel bg-white p-5 text-ink dark:bg-surface">
            <ConfidenceLegend />
          </div>
        </div>
      </aside>
    </div>
  );
}
