import { z } from "zod";

/**
 * Profil professionnel structuré extrait d'un CV.
 * Chaque élément porte `evidence` : l'extrait exact du CV dont il provient.
 * Un élément sans preuve retrouvée dans le texte source est rejeté (voir grounding.ts).
 */

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().default(null);

export const SKILL_CATEGORIES = ["skill", "tool", "soft_skill", "language", "certification", "other"] as const;

export const experienceSchema = z.object({
  title: text(200).min(1),
  company: optionalText(200),
  location: optionalText(200),
  startDate: optionalText(40),
  endDate: optionalText(40),
  isCurrent: z.boolean().default(false),
  achievements: z.array(text(500).min(1)).max(20).default([]),
  evidence: text(1000).min(1),
});

export const educationSchema = z.object({
  degree: text(300).min(1),
  institution: optionalText(200),
  year: optionalText(20),
  evidence: text(1000).min(1),
});

export const skillSchema = z.object({
  name: text(120).min(1),
  category: z.enum(SKILL_CATEGORIES).default("skill"),
  evidence: text(1000).min(1),
});

export const languageSchema = z.object({
  name: text(60).min(1),
  level: optionalText(60),
  evidence: text(500).min(1),
});

export const identitySchema = z.object({
  fullName: optionalText(200),
  headline: optionalText(200),
  email: optionalText(254),
  phone: optionalText(40),
  location: optionalText(200),
});

export const resumeProfileSchema = z.object({
  identity: identitySchema,
  summary: optionalText(2000),
  experiences: z.array(experienceSchema).max(30).default([]),
  education: z.array(educationSchema).max(20).default([]),
  skills: z.array(skillSchema).max(100).default([]),
  languages: z.array(languageSchema).max(15).default([]),
});

export type ResumeProfile = z.infer<typeof resumeProfileSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Language = z.infer<typeof languageSchema>;

/** Ce qui est stocké dans resumes.parsed_profile. */
export const storedParseSchema = z.object({
  version: z.literal(1),
  source: z.enum(["heuristic", "ai"]),
  profile: resumeProfileSchema,
  /** Informations manquantes ou à améliorer, détectées sur le texte. */
  gaps: z.array(z.object({ key: z.string(), message: z.string() })).default([]),
  /** Lignes du CV écartées car elles ressemblaient à des consignes adressées à une IA. */
  ignoredLines: z.array(z.string()).default([]),
  /** Éléments proposés par l'IA mais rejetés faute de preuve dans le CV. */
  rejectedUngrounded: z.number().int().nonnegative().default(0),
});
export type StoredParse = z.infer<typeof storedParseSchema>;

export const emptyProfile = (): ResumeProfile => ({
  identity: { fullName: null, headline: null, email: null, phone: null, location: null },
  summary: null,
  experiences: [],
  education: [],
  skills: [],
  languages: [],
});

/** Preuve attribuée à un élément saisi par l'utilisateur lors de la vérification. */
export const USER_EVIDENCE = "Saisi par vous lors de la vérification";
