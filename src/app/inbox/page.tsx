import type { Metadata } from "next";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import { createClient } from "@/lib/supabase/server";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox · Glass Box" };

export default async function InboxPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <SignInGate
        nextPath="/inbox"
        title="Sign in to get agent requests"
        body="Keep this page open. When an agent asks, it pops up here."
      />
    );

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, agent_name, task, plan, status, stated, critique, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error)
    return (
      <ErrorCard
        title="Could not load your inbox"
        body="The database did not respond. Refresh to try again."
      />
    );

  return <Inbox userId={auth.user.id} initialReviews={reviews} />;
}
