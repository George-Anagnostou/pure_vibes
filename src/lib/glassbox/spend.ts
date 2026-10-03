import "server-only";
import { z } from "zod";
import { HttpError } from "@/lib/http";
import { stripeClient } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

// Budget enforcement lives in the request_spend RPC (atomic, logs its own
// spend/breach events). Stripe is only called after the RPC approves.

const RpcResult = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  spend_id: z.string().optional(),
  remaining_cents: z.number().optional(),
});

export type SpendResult = {
  allowed: boolean;
  reason?: string;
  spend_id?: string;
  remaining_cents?: number;
  stripe: "succeeded" | "failed" | "skipped" | "not_attempted";
  payment_intent_id?: string;
};

export async function requestSpend(
  reviewId: string,
  userId: string,
  amountCents: number,
  purpose: string,
): Promise<SpendResult> {
  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > 10_000_000
  ) {
    throw new HttpError(400, "amount_cents must be a positive integer.");
  }
  const cleanPurpose = purpose.trim().slice(0, 300);
  if (!cleanPurpose) throw new HttpError(400, "purpose is required.");

  const admin = createAdminClient();
  const { data: review, error } = await admin
    .from("reviews")
    .select("id")
    .eq("id", reviewId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new HttpError(404, "Review not found.");

  const { data, error: rpcError } = await admin.rpc("request_spend", {
    p_review_id: reviewId,
    p_amount_cents: amountCents,
    p_purpose: cleanPurpose,
  });
  if (rpcError) throw rpcError;
  const result = RpcResult.parse(data);

  if (!result.allowed || !result.spend_id) {
    return {
      allowed: false,
      reason: result.reason ?? "Spend refused.",
      remaining_cents: result.remaining_cents,
      stripe: "not_attempted",
    };
  }

  const approved = {
    allowed: true,
    spend_id: result.spend_id,
    remaining_cents: result.remaining_cents,
  };
  if (!process.env.STRIPE_SECRET_KEY?.trim())
    return { ...approved, stripe: "skipped" };

  let paymentIntentId: string | undefined;
  let status: "succeeded" | "failed" = "failed";
  try {
    const intent = await stripeClient().paymentIntents.create(
      {
        amount: amountCents,
        currency: "usd",
        payment_method: "pm_card_visa",
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: `Glass Box: ${cleanPurpose}`.slice(0, 200),
        metadata: { review_id: reviewId, spend_id: result.spend_id },
      },
      { idempotencyKey: `glassbox-spend-${result.spend_id}` },
    );
    paymentIntentId = intent.id;
    status = intent.status === "succeeded" ? "succeeded" : "failed";
  } catch (stripeError) {
    console.error("glassbox_spend_stripe_failed", {
      spendId: result.spend_id,
      type: stripeError instanceof Error ? stripeError.name : "Unknown",
    });
  }

  const { error: updateError } = await admin
    .from("spends")
    .update({ stripe_payment_intent_id: paymentIntentId ?? null, status })
    .eq("id", result.spend_id);
  if (updateError) throw updateError;

  if (status === "failed") {
    // A failed spend no longer counts against the budget (the RPC sums status <> 'failed').
    return {
      allowed: false,
      reason: "The budget allowed this spend, but the test payment failed.",
      spend_id: result.spend_id,
      stripe: "failed",
      payment_intent_id: paymentIntentId,
    };
  }
  return {
    ...approved,
    stripe: "succeeded",
    payment_intent_id: paymentIntentId,
  };
}
