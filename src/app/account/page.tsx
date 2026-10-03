import Link from "next/link";
import styles from "@/components/glassbox/glassbox.module.css";
import { Shell } from "@/components/glassbox/shell";
import { SignInGate } from "@/components/sign-in-gate";
import { SignOutButton } from "@/components/session-actions";
import { createClient } from "@/lib/supabase/server";
import { getBillingPlan } from "@/lib/stripe/plan";
import { BillingActions } from "./billing-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account & billing · Glass Box" };
const statusLabels: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Payment overdue",
  unpaid: "Payment required",
  canceled: "Canceled",
  incomplete: "Payment incomplete",
  incomplete_expired: "Checkout expired",
  paused: "Paused",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <Shell>
        <SignInGate
          nextPath="/account"
          title="Sign in to your account"
          body="View your subscription, manage billing, and connect your agents."
        />
      </Shell>
    );
  const [params, subscriptions, customer, plan] = await Promise.all([
    searchParams,
    supabase
      .from("subscriptions")
      .select(
        "id,status,price_id,current_period_end,cancel_at_period_end,updated_at",
      )
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("billing_customers")
      .select("user_id")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    getBillingPlan().catch(() => null),
  ]);
  const subscription =
    subscriptions.data?.find(
      (row) => !["canceled", "incomplete_expired"].includes(row.status),
    ) ?? subscriptions.data?.[0];
  const hasCurrentSubscription = Boolean(
    subscription &&
    !["canceled", "incomplete_expired"].includes(subscription.status),
  );
  const failed = Boolean(subscriptions.error || customer.error);
  const testMode = /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "");
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  return (
    <Shell>
      <main
        className={styles.onboardShell}
        style={{ maxWidth: 620, display: "grid", gap: 20 }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 className={`${styles.taskHeader} ${styles.pretty}`}>
            Account &amp; billing
          </h1>
          <p className={styles.agentName} style={{ marginBottom: 8 }}>
            {auth.user.email}
          </p>
          <SignOutButton />
        </div>
        {params.billing === "success" && (
          <p role="status" className={styles.statusCard}>
            You&apos;ve returned from checkout. Your subscription status below
            updates after Stripe confirms payment. Refresh status if it&apos;s
            still pending.
          </p>
        )}
        {params.billing === "cancelled" && (
          <p role="status" className={styles.optCard}>
            Checkout was canceled. You can subscribe whenever you&apos;re ready.
          </p>
        )}
        <section className={styles.optCard}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-black">Your subscription</h2>
            {testMode && (
              <span className={`${styles.pill} ${styles.pillPending}`}>
                Sandbox · no real charges
              </span>
            )}
          </div>
          {failed ? (
            <p
              role="alert"
              className={styles.alertCard}
              style={{ marginTop: 16 }}
            >
              We couldn&apos;t load your billing status. Refresh to try again.
            </p>
          ) : (
            <>
              <p className="mt-4 text-lg font-bold">
                {subscription
                  ? (statusLabels[subscription.status] ?? "Status unavailable")
                  : "No subscription yet"}
              </p>
              {periodEnd && (
                <p className="mt-1 text-sm text-ink-soft">
                  {subscription?.cancel_at_period_end
                    ? "Access ends"
                    : subscription?.status === "canceled"
                      ? "Last billing period ended"
                      : "Current billing period ends"}{" "}
                  {periodEnd}.
                </p>
              )}
              {subscription?.cancel_at_period_end && (
                <p className="mt-2 text-sm">
                  Cancellation is scheduled. You can review it in Manage
                  billing.
                </p>
              )}
            </>
          )}
          {plan ? (
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="font-bold">{plan.name}</h3>
              <p className="mt-1 text-2xl font-black">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: plan.currency,
                }).format(plan.unitAmount / 100)}
                <span className="text-base font-medium text-ink-soft">
                  {" "}
                  / month per account
                </span>
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                Plan allowance: {plan.includedCheckpoints} review checkpoints
                per month.
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Usage reporting is not available yet.
              </p>
            </div>
          ) : (
            <p role="status" className="mt-4 text-ink-soft">
              Plan details are temporarily unavailable. Refresh to try again.
            </p>
          )}
          <BillingActions
            canSubscribe={!failed && Boolean(plan) && !hasCurrentSubscription}
            canManage={!failed && Boolean(customer.data)}
          />
          <p className="mt-4 text-xs text-ink-soft">
            Stripe securely handles payments, invoices, payment methods, and
            cancellation.
          </p>
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/connect"
            className={`${styles.optCard} ${styles.reviewLink}`}
          >
            <span className="block font-bold">Connect an agent →</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Set up Claude Code, Cursor, or another MCP client.
            </span>
          </Link>
          <Link
            href="/profile"
            className={`${styles.optCard} ${styles.reviewLink}`}
          >
            <span className="block font-bold">Your preferences →</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Set the priorities your agents should follow.
            </span>
          </Link>
        </section>
      </main>
    </Shell>
  );
}
