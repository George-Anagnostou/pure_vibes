import type { Metadata } from "next";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import { Shell } from "@/components/glassbox/shell";
import { createClient } from "@/lib/supabase/server";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · Glass Box" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <Shell>
        <SignInGate
          nextPath="/dashboard"
          title="Sign in to get agent requests"
          body="Keep this page open. When an agent asks, it pops up here."
        />
      </Shell>
    );

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select(
      "id, agent_name, task, plan, status, stated, priorities, understanding, challenge_answers, answered_at, critique, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (error)
    return (
      <Shell>
        <ErrorCard
          title="Could not load your dashboard"
          body="The database did not respond. Refresh to try again."
        />
      </Shell>
    );

  return (
    <Shell>
      <Dashboard userId={auth.user.id} initialReviews={reviews} />
    </Shell>
  );
}
