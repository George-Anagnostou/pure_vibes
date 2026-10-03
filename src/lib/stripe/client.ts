import "server-only";
import Stripe from "stripe";
import { requiredEnv } from "@/lib/env";

export function stripeClient() {
  // Uses the API version pinned by the installed Stripe SDK; commit the lockfile.
  return new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
    maxNetworkRetries: 2,
    timeout: 15_000,
  });
}
