import type { RequirementResult } from "@/lib/validation/offer";

/**
 * Préparation d'entretien sans IA : questions probables tirées de l'offre analysée,
 * pistes issues du CV vérifié (citées telles quelles), questions à poser, repères de salaire.
 */

export interface PrepQuestion {
  id: string;
  kind: "classic" | "requirement" | "gap";
  text: string;
  hint: string;
  /** Extrait du CV vérifié qui peut servir de point de départ (situation STAR). */
  evidence: string | null;
}

export interface InterviewPrep {
  questions: PrepQuestion[];
  questionsToAsk: string[];
  salary: { desired: string | null; offer: string | null; advice: string };
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function buildInterviewPrep(input: {
  company: string;
  jobTitle: string;
  requirements: RequirementResult[];
  desiredSalary: { min: number | null; max: number | null };
  offerSalary: string | null;
}): InterviewPrep {
  const { company, jobTitle, requirements } = input;
  const classic: PrepQuestion[] = [
    { id: "presentation", kind: "classic", text: "Présentez-vous en deux minutes.", hint: "Votre parcours en trois temps, en finissant par ce qui vous amène à ce poste.", evidence: null },
    { id: "motivation", kind: "classic", text: `Pourquoi ce poste de ${jobTitle} chez ${company} ?`, hint: "Un élément concret de l'offre ou de l'entreprise, relié à votre expérience.", evidence: null },
    { id: "realisation", kind: "classic", text: "Quelle réalisation retiendriez-vous de votre parcours ?", hint: "Choisissez-en une mesurable et racontez-la avec la méthode STAR.", evidence: null },
    { id: "desaccord", kind: "classic", text: "Racontez un désaccord dans une équipe et la façon dont vous l'avez géré.", hint: "Restez factuel ; montrez ce que vous avez fait et appris.", evidence: null },
  ];

  const mandatoryFirst = [...requirements].sort((a, b) => Number(b.kind === "mandatory") - Number(a.kind === "mandatory"));
  const fromRequirements: PrepQuestion[] = mandatoryFirst
    .filter((r) => r.coverage === "demonstrated" || r.coverage === "partial")
    .filter((r) => r.category !== "language" && r.category !== "education")
    .slice(0, 5)
    .map((r) => ({
      id: `req-${slug(r.label)}`,
      kind: "requirement",
      text: r.category === "soft_skill" ? `Donnez un exemple qui montre : ${r.label.toLowerCase()}.` : `Racontez une situation où vous avez mis en œuvre : ${r.label}.`,
      hint: r.coverage === "partial" ? "Votre CV le montre en partie : précisez ce que vous avez réellement fait, sans exagérer." : "Votre CV le démontre : préparez les chiffres et le contexte.",
      evidence: r.resumeEvidence?.split("\n").find((l) => l.length >= 15) ?? r.resumeEvidence ?? null,
    }));

  const gaps: PrepQuestion[] = mandatoryFirst
    .filter((r) => r.kind === "mandatory" && r.coverage === "missing" && r.category !== "soft_skill")
    .slice(0, 3)
    .map((r) => ({
      id: `gap-${slug(r.label)}`,
      kind: "gap",
      text: `L'offre demande « ${r.label} ». Comment répondriez-vous si on vous interroge à ce sujet ?`,
      hint: "Soyez honnête : dites ce que vous savez, ce qui s'en rapproche dans votre parcours, et comment vous comptez combler l'écart. N'affirmez pas une compétence que vous n'avez pas.",
      evidence: null,
    }));

  const desired =
    input.desiredSalary.min != null || input.desiredSalary.max != null
      ? [input.desiredSalary.min, input.desiredSalary.max].filter((x): x is number => x != null).map(eur).join(" – ") + " brut annuel"
      : null;

  return {
    questions: [...classic, ...fromRequirements, ...gaps],
    questionsToAsk: [
      "À quoi ressemblerait une réussite sur ce poste au bout de six mois ?",
      "Comment l'équipe est-elle organisée, et avec qui travaillerais-je au quotidien ?",
      "Quelles sont les prochaines étapes du processus de recrutement, et dans quels délais ?",
      "Quel est le principal défi de l'équipe en ce moment ?",
    ],
    salary: {
      desired,
      offer: input.offerSalary,
      advice: input.offerSalary
        ? "L'offre annonce une rémunération : appuyez-vous dessus et donnez une fourchette cohérente avec elle et avec votre expérience."
        : "L'offre n'annonce pas de rémunération : donnez une fourchette plutôt qu'un chiffre unique, et demandez la composition du package (variable, avantages).",
    },
  };
}

export interface StarAnswer {
  situation: string;
  task: string;
  action: string;
  result: string;
}

/** Contrôle de complétude STAR : rien n'est jugé, on signale seulement ce qui manque. */
export function starFeedback(a: StarAnswer): string[] {
  const notes: string[] = [];
  const parts: [keyof StarAnswer, string][] = [
    ["situation", "la situation"],
    ["task", "votre rôle ou objectif"],
    ["action", "ce que vous avez fait"],
    ["result", "le résultat"],
  ];
  const missing = parts.filter(([k]) => a[k].trim().length < 10).map(([, l]) => l);
  if (missing.length) notes.push(`À compléter : ${missing.join(", ")}.`);
  if (a.result.trim() && !/\d/.test(a.result)) notes.push("Le résultat ne contient aucun chiffre : si vous en avez un (délai, volume, pourcentage), ajoutez-le.");
  if (a.action.trim() && !/\b(j'ai|je |j’ai)/i.test(a.action) && /\bnous\b|\bon\b/i.test(a.action)) {
    notes.push("L'action est décrite au « nous » : précisez ce que vous avez fait vous-même.");
  }
  const total = Object.values(a).join(" ").length;
  if (total > 1800) notes.push("Réponse longue : visez environ deux minutes à l'oral.");
  return notes;
}
