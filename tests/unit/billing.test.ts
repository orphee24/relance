import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { checkoutParams } from "@/server/billing/checkout";
import { handleStripeEvent, type WebhookDeps } from "@/server/billing/webhook";

const USER = "11111111-1111-1111-1111-111111111111";

function deps(processed = new Set<string>()): WebhookDeps & { granted: unknown[]; refunds: unknown[] } {
  const granted: unknown[] = [];
  const refunds: unknown[] = [];
  return {
    granted,
    refunds,
    alreadyProcessed: async (id) => processed.has(id),
    markProcessed: async (id) => void processed.add(id),
    grantPass: async (i) => void granted.push(i),
    recordRefund: async (pi, c) => void refunds.push([pi, c]),
    receiptUrl: async () => "https://pay.stripe.com/receipts/test",
    log: vi.fn(),
  };
}

const sessionEvent = (over: Record<string, unknown> = {}, type = "checkout.session.completed") =>
  ({
    id: `evt_${Math.random()}`,
    object: "event",
    type,
    data: {
      object: {
        id: "cs_test_1", object: "checkout.session", mode: "payment", payment_status: "paid", amount_total: 1900, currency: "eur",
        payment_intent: "pi_1", client_reference_id: USER, metadata: { user_id: USER, plan_code: "pro", withdrawal_waiver_at: "2026-11-12T20:00:00.000Z" }, ...over,
      },
    },
  }) as unknown as Stripe.Event;

describe("session de paiement", () => {
  it("paiement unique, montant de la table plans, renonciation horodatée", () => {
    const p = checkoutParams({ plan: { code: "pro", name: "Pro", priceCents: 1900, durationDays: 30 }, userId: USER, email: "a@exemple.test", siteUrl: "https://relance.example", waiverAt: new Date("2026-11-12T20:00:00Z") });
    expect(p.mode).toBe("payment");
    expect(p.line_items?.[0]?.price_data?.unit_amount).toBe(1900);
    expect(p.line_items?.[0]?.price_data?.product_data?.description).toMatch(/sans renouvellement automatique/);
    expect(p.metadata).toEqual({ user_id: USER, plan_code: "pro", withdrawal_waiver_at: "2026-11-12T20:00:00.000Z" });
    expect(p.success_url).toContain("{CHECKOUT_SESSION_ID}");
    expect(p).not.toHaveProperty("subscription_data");
  });
});

describe("webhook Stripe", () => {
  it("attribue le forfait une seule fois", async () => {
    const d = deps();
    const e = sessionEvent();
    expect(await handleStripeEvent(e, d)).toBe("granted");
    expect(await handleStripeEvent(e, d)).toBe("duplicate");
    expect(d.granted).toEqual([
      { userId: USER, plan: "pro", checkoutSession: "cs_test_1", paymentIntent: "pi_1", amountCents: 1900, currency: "eur", waiverAt: "2026-11-12T20:00:00.000Z", receiptUrl: "https://pay.stripe.com/receipts/test" },
    ]);
  });
  it("attend la confirmation d'un paiement différé", async () => {
    const d = deps();
    expect(await handleStripeEvent(sessionEvent({ payment_status: "unpaid" }), d)).toBe("awaiting_payment");
    expect(await handleStripeEvent(sessionEvent({}, "checkout.session.async_payment_succeeded"), d)).toBe("granted");
    expect(d.granted).toHaveLength(1);
  });
  it("refuse des métadonnées incohérentes", async () => {
    const d = deps();
    expect(await handleStripeEvent(sessionEvent({ metadata: { user_id: "x", plan_code: "pro" }, client_reference_id: null }), d)).toBe("invalid_metadata");
    expect(await handleStripeEvent(sessionEvent({ metadata: { user_id: USER, plan_code: "free" } }), d)).toBe("invalid_metadata");
    expect(d.granted).toHaveLength(0);
  });
  it("enregistre les remboursements", async () => {
    const d = deps();
    const e = { id: "evt_r", object: "event", type: "charge.refunded", data: { object: { payment_intent: "pi_1", amount_refunded: 1900 } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(e, d)).toBe("refund_recorded");
    expect(d.refunds).toEqual([["pi_1", 1900]]);
  });
  it("ignore les autres évènements", async () => {
    expect(await handleStripeEvent({ id: "evt_x", type: "customer.created", data: { object: {} } } as unknown as Stripe.Event, deps())).toBe("ignored");
  });
  it("n'accepte que des évènements signés avec le bon secret", () => {
    const stripe = new Stripe("sk_test_offline");
    const payload = JSON.stringify(sessionEvent());
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_good" });
    expect(stripe.webhooks.constructEvent(payload, header, "whsec_good").type).toBe("checkout.session.completed");
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_bad")).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload.replace("1900", "1"), header, "whsec_good")).toThrow();
  });
});
