import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { assertSameOrigin, errorResponse, HttpError, json } from "@/lib/http";
import { stripeClient } from "@/lib/stripe/client";
import { getOrCreateCustomer } from "@/lib/stripe/customer";
import { getBillingPlan } from "@/lib/stripe/plan";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const stripe = stripeClient();
    // Reject inactive/misconfigured plans before creating a customer or session.
    const plan = await getBillingPlan();
    const price = plan.priceId;
    const customer = await getOrCreateCustomer(user.id);
    const subscriptions = await stripe.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    ) {
      throw new HttpError(
        409,
        "You already have a subscription. Use Manage billing.",
      );
    }
    const open = await stripe.checkout.sessions.list({
      customer,
      status: "open",
      limit: 10,
    });
    const existing = open.data.find(
      (s) => s.metadata?.price_id === price && s.mode === "subscription",
    );
    if (existing?.url) return json({ url: existing.url });
    const session = await stripe.checkout.sessions.create(
      {
        customer,
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: user.id,
        metadata: { price_id: price, plan_version: plan.version },
        subscription_data: { metadata: { supabase_user_id: user.id } },
        success_url: `${appUrl()}/?billing=success`,
        cancel_url: `${appUrl()}/?billing=cancelled`,
      },
      {
        idempotencyKey: `checkout:${user.id}:${price}:${Math.floor(Date.now() / 1_800_000)}`,
      },
    );
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
}
