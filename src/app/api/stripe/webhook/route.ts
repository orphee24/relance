import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/server/env";
import { getStripe } from "@/server/billing/stripe";
import { handleStripeEvent } from "@/server/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Webhook Stripe : signature vérifiée sur le corps brut, traitement idempotent par identifiant d'évènement. */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  const admin = createAdminClient();
  if (!stripe || !secret || !admin) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event, {
      alreadyProcessed: async (id) => Boolean((await admin.from("stripe_events").select("id").eq("id", id).maybeSingle()).data),
      markProcessed: async (id, type) => {
        await admin.from("stripe_events").upsert({ id, type }, { onConflict: "id", ignoreDuplicates: true });
      },
      grantPass: async (i) => {
        const { error } = await admin.rpc("grant_pass", {
          p_user: i.userId,
          p_plan: i.plan,
          p_checkout_session: i.checkoutSession,
          p_payment_intent: i.paymentIntent,
          p_amount_cents: i.amountCents,
          p_currency: i.currency,
          p_withdrawal_waiver_at: i.waiverAt,
          p_receipt_url: i.receiptUrl,
        });
        if (error) throw new Error(`grant_pass: ${error.code}`);
      },
      recordRefund: async (pi, cents) => {
        const { error } = await admin.rpc("record_refund", { p_payment_intent: pi, p_refunded_cents: cents });
        if (error) throw new Error(`record_refund: ${error.code}`);
      },
      receiptUrl: async (pi) => {
        const intent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
        const charge = intent.latest_charge;
        return charge && typeof charge !== "string" ? charge.receipt_url ?? null : null;
      },
      log: (message, meta) => console.warn(message, meta),
    });
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    // Erreur temporaire : Stripe renverra l'évènement (traitement idempotent).
    console.error("stripe webhook", e instanceof Error ? e.message : "error");
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
