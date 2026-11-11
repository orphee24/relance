import { z } from "zod";

export const REQUIREMENT_CATEGORIES = [
  "skill", "tool", "experience", "education", "language", "certification", "soft_skill", "other",
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const COVERAGE_STATES = ["demonstrated", "partial", "missing", "unknown"] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

const nullableText = (max: number) => z.string().trim().max(max).nullable().default(null);

/** Critère extrait d'une offre, avec l'extrait exact de l'offre qui le justifie. */
export const offerRequirementSchema = z.object({
  label: z.string().trim().min(2).max(300),
  kind: z.enum(["mandatory", "preferred"]),
  category: z.enum(REQUIREMENT_CATEGORIES),
  offerEvidence: z.string().trim().min(2).max(1000),
});
export type OfferRequirement = z.infer<typeof offerRequirementSchema>;

export const offerExtractionSchema = z.object({
  title: nullableText(300),
  company: nullableText(200),
  location: nullableText(200),
  department: nullableText(200),
  contractType: z.enum(["cdi", "cdd", "freelance", "interim", "alternance", "stage", "other"]).nullable().default(null),
  salaryText: nullableText(200),
  requirements: z.array(offerRequirementSchema).max(40).default([]),
});
export type OfferExtraction = z.infer<typeof offerExtractionSchema>;

/** Réponse attendue d'une IA pour l'évaluation critère par critère. */
export const aiMatchSchema = z.object({
  matches: z
    .array(
      z.object({
        index: z.number().int().min(0),
        coverage: z.enum(COVERAGE_STATES),
        resumeEvidence: z.string().trim().max(1000).nullable(),
        explanation: z.string().trim().max(400),
      }),
    )
    .max(40),
});

export const requirementResultSchema = offerRequirementSchema.extend({
  coverage: z.enum(COVERAGE_STATES),
  resumeEvidence: z.string().nullable(),
  explanation: z.string(),
});
export type RequirementResult = z.infer<typeof requirementResultSchema>;

export const suggestionSchema = z.object({
  id: z.string(),
  type: z.enum(["add_skill_from_resume", "declare_if_true", "information"]),
  requirementLabel: z.string(),
  title: z.string(),
  detail: z.string(),
  /** Compétence à ajouter (add_skill_from_resume). */
  skillName: z.string().nullable().default(null),
  /** Extrait du CV qui justifie la suggestion. */
  resumeEvidence: z.string().nullable().default(null),
  status: z.enum(["pending", "accepted", "refused"]).default("pending"),
  /** Justification saisie par l'utilisateur (declare_if_true). */
  userNote: z.string().max(500).nullable().default(null),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const storedAnalysisSchema = z.object({
  version: z.literal(1),
  extractionSource: z.enum(["heuristic", "ai"]),
  matchingSource: z.enum(["heuristic", "ai", "none"]),
  metadata: offerExtractionSchema.omit({ requirements: true }),
  requirements: z.array(requirementResultSchema),
  suggestions: z.array(suggestionSchema),
  resumeVersionId: z.string().nullable(),
  resumeVersionLabel: z.string().nullable(),
  ignoredLines: z.array(z.string()),
  rejectedUngrounded: z.number().int().nonnegative(),
  score: z.number().nullable(),
  analyzedAt: z.string(),
});
export type StoredAnalysis = z.infer<typeof storedAnalysisSchema>;

/** Formulaire « Analyser une offre ». */
export const analyzeOfferFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(200, { error: "Collez le texte complet de l'offre (au moins 200 caractères)." })
    .max(30_000, { error: "L'offre dépasse 30 000 caractères. Retirez les parties sans rapport avec le poste." }),
  title: z.string().trim().max(300).transform((v) => v || null),
  company: z.string().trim().max(200).transform((v) => v || null),
  location: z.string().trim().max(200).transform((v) => v || null),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), { error: "Lien invalide : il doit commencer par https://" })
    .transform((v) => v || null),
  resumeVersionId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v))
    .transform((v) => v || null),
});
