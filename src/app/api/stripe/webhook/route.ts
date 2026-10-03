import { stripeClient } from "@/lib/stripe/client";
import { processStripeEvent } from "@/lib/stripe/webhook";
import { requiredEnv } from "@/lib/env";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe signature." }, 400);
  try {
    const stripe = stripeClient();
    const secret = requiredEnv("STRIPE_WEBHOOK_SECRET");
    const body = await request.text();
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
    } catch {
      return json({ error: "Invalid Stripe signature." }, 400);
    }
    await processStripeEvent(event);
    return json({ received: true });
  } catch (error) {
    // Return 5xx so Stripe retries failures; never acknowledge before persistence.
    return errorResponse(error);
  }
}
