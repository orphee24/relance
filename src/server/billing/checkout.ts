import type Stripe from "stripe";

export interface PlanForCheckout {
  code: "pro" | "premium";
  name: string;
  priceCents: number;
  durationDays: number;
}

/**
 * Session de paiement unique (mode « payment ») : jamais d'abonnement ni de renouvellement automatique.
 * Le montant vient de la table `plans` (configurable depuis l'administration).
 * La renonciation au droit de rétractation (exécution immédiate d'un service numérique) est horodatée.
 */
export function checkoutParams(input: {
  plan: PlanForCheckout;
  userId: string;
  email: string | null;
  siteUrl: string;
  waiverAt: Date;
}): Stripe.Checkout.SessionCreateParams {
  const { plan, userId, email, siteUrl, waiverAt } = input;
  const metadata = { user_id: userId, plan_code: plan.code, withdrawal_waiver_at: waiverAt.toISOString() };
  return {
    mode: "payment",
    locale: "fr",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: plan.priceCents,
          product_data: {
            name: `Relance ${plan.name} — ${plan.durationDays} jours`,
            description: `Accès ${plan.name} pendant ${plan.durationDays} jours. Paiement unique, sans renouvellement automatique.`,
          },
        },
      },
    ],
    client_reference_id: userId,
    ...(email ? { customer_email: email } : {}),
    metadata,
    payment_intent_data: { metadata },
    success_url: `${siteUrl}/parametres/forfait?paiement=succes&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/parametres/forfait?paiement=annule`,
  };
}
