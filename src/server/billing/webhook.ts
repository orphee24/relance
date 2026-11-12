import type Stripe from "stripe";

export interface WebhookDeps {
  alreadyProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
  grantPass(input: {
    userId: string;
    plan: string;
    checkoutSession: string;
    paymentIntent: string | null;
    amountCents: number;
    currency: string;
    waiverAt: string | null;
    receiptUrl: string | null;
  }): Promise<void>;
  recordRefund(paymentIntent: string, refundedCents: number): Promise<void>;
  receiptUrl?(paymentIntent: string): Promise<string | null>;
  log(message: string, meta?: Record<string, unknown>): void;
}

export type WebhookOutcome = "granted" | "refund_recorded" | "duplicate" | "ignored" | "awaiting_payment" | "invalid_metadata";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Traite un évènement Stripe déjà authentifié (signature vérifiée). Idempotent. */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  if (await deps.alreadyProcessed(event.id)) return "duplicate";
  let outcome: WebhookOutcome = "ignored";

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "payment") break;
      if (session.payment_status !== "paid") {
        outcome = "awaiting_payment"; // paiement différé : attribution à « async_payment_succeeded »
        break;
      }
      const userId = session.metadata?.user_id ?? session.client_reference_id ?? "";
      const plan = session.metadata?.plan_code ?? "";
      if (!UUID.test(userId) || !["pro", "premium"].includes(plan)) {
        deps.log("stripe: metadata invalide", { session: session.id });
        outcome = "invalid_metadata";
        break;
      }
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      let receiptUrl: string | null = null;
      if (paymentIntent && deps.receiptUrl) {
        try {
          receiptUrl = await deps.receiptUrl(paymentIntent);
        } catch {
          receiptUrl = null;
        }
      }
      await deps.grantPass({
        userId,
        plan,
        checkoutSession: session.id,
        paymentIntent,
        amountCents: session.amount_total ?? 0,
        currency: session.currency ?? "eur",
        waiverAt: session.metadata?.withdrawal_waiver_at ?? null,
        receiptUrl,
      });
      outcome = "granted";
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) {
        await deps.recordRefund(paymentIntent, charge.amount_refunded);
        outcome = "refund_recorded";
      }
      break;
    }
    default:
      break;
  }

  await deps.markProcessed(event.id, event.type);
  return outcome;
}
