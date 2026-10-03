import "server-only";
import type Stripe from "stripe";
import { stripeClient } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function processStripeEvent(event: Stripe.Event) {
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  )
    return;

  const snapshot = event.data.object as Stripe.Subscription;
  // Stripe does not guarantee delivery order. Retrieve current state, not stale event data.
  const subscription = await stripeClient().subscriptions.retrieve(snapshot.id);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const item = subscription.items.data[0];
  if (!item) throw new Error("Subscription has no price item");
  const { error } = await createAdminClient().rpc("sync_subscription", {
    p_event_id: event.id,
    p_event_created: event.created,
    p_customer_id: customerId,
    p_subscription_id: subscription.id,
    p_status: subscription.status,
    p_price_id: item.price.id,
    p_period_end: new Date(item.current_period_end * 1000).toISOString(),
    p_cancel_at_period_end: subscription.cancel_at_period_end,
  });
  if (error) throw error;
}
