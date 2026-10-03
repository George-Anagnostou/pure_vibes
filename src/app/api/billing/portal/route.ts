import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { assertSameOrigin, errorResponse, HttpError, json } from "@/lib/http";
import { stripeClient } from "@/lib/stripe/client";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new HttpError(409, "Start a subscription before opening billing.");
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${appUrl()}/`,
    });
    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
}
