import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LiveFeed } from "./live-feed";

// BASIC placeholder UI — Kathryn's design replaces this.
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <main className="p-6"><p>Sign in first.</p><Link className="underline" href="/">Sign in</Link></main>;
  const [{ data: reviews }, { data: events }] = await Promise.all([
    supabase.from("reviews").select("id, agent_name, task, status, critique, revealed, created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("events").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Glass Box</h1>
      <LiveFeed userId={auth.user.id} initialReviews={reviews ?? []} initialEvents={events ?? []} />
    </main>
  );
}
