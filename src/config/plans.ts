/**
 * Valeurs par défaut des offres. La table `plans` en base fait foi en production
 * (prix et quotas configurables depuis l'administration).
 * Les forfaits payants sont des paiements uniques à durée fixe : jamais renouvelés automatiquement.
 */
export type PlanCode = "free" | "pro" | "premium";

export interface PlanQuotas {
  offer_analyses: number | null; // null = illimité
  tracked_applications: number | null;
  ai_follow_ups: number | null;
  network_searches_per_day: number;
  interview_coach: boolean;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  priceCents: number;
  durationDays: number | null;
  isRecurring: false;
  quotas: PlanQuotas;
}

export const DEFAULT_PLANS: Record<PlanCode, PlanDefinition> = {
  free: {
    code: "free",
    name: "Free",
    priceCents: 0,
    durationDays: null,
    isRecurring: false,
    quotas: { offer_analyses: 3, tracked_applications: 5, ai_follow_ups: 2, network_searches_per_day: 2, interview_coach: false },
  },
  pro: {
    code: "pro",
    name: "Pro",
    priceCents: 1900,
    durationDays: 30,
    isRecurring: false,
    quotas: { offer_analyses: 30, tracked_applications: null, ai_follow_ups: null, network_searches_per_day: 10, interview_coach: false },
  },
  premium: {
    code: "premium",
    name: "Premium",
    priceCents: 4900,
    durationDays: 30,
    isRecurring: false,
    quotas: { offer_analyses: 100, tracked_applications: null, ai_follow_ups: null, network_searches_per_day: 25, interview_coach: true },
  },
};
