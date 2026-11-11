import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfidenceLegend } from "@/components/ui/confidence";

const POINTS = [
  {
    title: "Comprenez chaque offre",
    text: "Relance compare l'offre à votre CV critère par critère et montre ce que votre CV démontre, avec les extraits qui le prouvent.",
  },
  {
    title: "Trouvez qui contacter",
    text: "Pour chaque entreprise, identifiez de futurs collègues, des managers et des recruteurs pertinents, avec la source de chaque information.",
  },
  {
    title: "Sachez quoi faire aujourd'hui",
    text: "Chaque jour, trois actions utiles et la raison de chacune : relancer, contacter, préparer un entretien.",
  },
];

export default function HomePage() {
  return (
    <div className="grid gap-20 py-12 sm:py-20">
      <section className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <h1 className="max-w-[14ch] text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[4rem]">
            Ne postulez plus dans le vide.
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg text-muted">
            Relance vous aide à comprendre vos candidatures, améliorer votre CV sans rien inventer, et entrer en contact
            avec les bonnes personnes dans les entreprises qui vous intéressent.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/inscription">Commencer gratuitement</Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/connexion">J&apos;ai déjà un compte</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-panel border border-line bg-surface p-6">
          <p className="font-medium">Ce que Relance sait, et ce qu&apos;il ne sait pas</p>
          <p className="mt-1 text-sm text-muted">
            Aucun profil inventé, aucun score ATS présenté comme réel, aucune raison de refus supposée. Chaque information
            porte son niveau de fiabilité.
          </p>
          <ConfidenceLegend className="mt-5" />
        </div>
      </section>

      <section aria-label="Fonctionnalités" className="grid gap-8 border-t border-line pt-10 md:grid-cols-3">
        {POINTS.map((p) => (
          <div key={p.title}>
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <p className="mt-2 text-muted">{p.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
