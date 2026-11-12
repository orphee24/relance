import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/server/env";

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}
