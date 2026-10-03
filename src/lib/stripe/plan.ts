import "server-only";
import { z } from "zod";
import { requiredEnv } from "@/lib/env";
import { stripeClient } from "@/lib/stripe/client";

// Price metadata is configured by the operator, never by a checkout request.
// It describes the plan; the usage ledger must enforce the allowance separately.
const monthlyPlanPrice = z.object({
  id: z.string().min(1),
  active: z.literal(true),
  billing_scheme: z.literal("per_unit"),
  type: z.literal("recurring"),
  currency: z.string().length(3),
  unit_amount: z.number().int().nonnegative(),
  transform_quantity: z.null(),
  recurring: z.object({
    interval: z.literal("month"),
    interval_count: z.literal(1),
    usage_type: z.literal("licensed"),
  }),
  product: z.object({
    id: z.string().min(1),
    active: z.literal(true),
    name: z.string().min(1),
  }),
  metadata: z.object({
    included_checkpoints: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
    overage_policy: z.literal("blocked"),
    plan_version: z.string().min(1),
  }),
});

export function parseBillingPlan(value: unknown) {
  const price = monthlyPlanPrice.parse(value);
  return {
    priceId: price.id,
    name: price.product.name,
    currency: price.currency,
    unitAmount: price.unit_amount,
    interval: price.recurring.interval,
    includedCheckpoints: price.metadata.included_checkpoints,
    overagePolicy: price.metadata.overage_policy,
    version: price.metadata.plan_version,
  };
}

export async function getBillingPlan() {
  const price = await stripeClient().prices.retrieve(
    requiredEnv("STRIPE_PRICE_ID"),
    { expand: ["product"] },
  );
  return parseBillingPlan(price);
}
