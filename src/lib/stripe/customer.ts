import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe/client";

export async function getOrCreateCustomer(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.stripe_customer_id;

  const customer = await stripeClient().customers.create(
    { metadata: { supabase_user_id: userId } },
    { idempotencyKey: `customer:${userId}` },
  );
  const { error: insertError } = await admin
    .from("billing_customers")
    .upsert(
      { user_id: userId, stripe_customer_id: customer.id },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;
  const { data: saved, error: savedError } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();
  if (savedError) throw savedError;
  return saved.stripe_customer_id;
}
