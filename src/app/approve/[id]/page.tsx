import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_DIALS, DEFAULT_HARD_LINES, type Critique, type Dials, type HardLines, type Revealed } from "@/lib/glassbox/types";
import { ApproveForm } from "./approve-form";

// BASIC placeholder UI — Kathryn's design replaces this. Data contract: lib/glassbox/types.ts.
export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <main className="p-6"><p>Sign in first.</p><Link className="underline" href="/">Sign in</Link></main>;

  const { data: review } = await supabase.from("reviews").select("*").eq("id", id).maybeSingle();
  if (!review) notFound();
  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", auth.user.id).maybeSingle();

  const revealed = review.revealed as unknown as Revealed;
  const critique = review.critique as unknown as Critique;
  const before = revealed.priorities.map((p) => p.name);
  const candidates = [...new Set([...before, ...critique.missing_priorities.map((m) => m.name)])];

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <p className="text-sm opacity-70">{review.agent_name} wants to: {review.task}</p>
      <h1 className="text-xl font-bold">{revealed.headline}</h1>
      <p className={critique.verdict === "red" ? "font-bold text-red-600" : critique.verdict === "yellow" ? "font-bold text-yellow-600" : "font-bold text-green-600"}>
        {critique.verdict.toUpperCase()}: {critique.summary}
      </p>
      {critique.hard_line_risks.map((r, i) => (
        <p key={i} className={r.severity === "block" ? "text-red-600" : "text-yellow-600"}>⚠ {r.explanation}</p>
      ))}
      <section>
        <h2 className="font-semibold">What the plan is really optimizing for</h2>
        <ol className="list-decimal pl-5">
          {revealed.priorities.map((p) => <li key={p.name}><b>{p.name}</b> — {p.evidence}</li>)}
        </ol>
        <p>Ignored: {revealed.ignored.join(", ") || "nothing"} · Est. ${revealed.est_cost.monthly_usd}/mo</p>
      </section>
      <section>
        <h2 className="font-semibold">Alternatives</h2>
        <ul className="list-disc pl-5">
          {critique.alternatives.map((a, i) => <li key={i}>{a.ordering.join(" > ")}: {a.biggest_change} (~${a.est_monthly_usd}/mo)</li>)}
        </ul>
      </section>
      {review.status === "pending" ? (
        <ApproveForm
          reviewId={id}
          candidates={candidates}
          initialDials={(profile?.dials as Dials) && Object.keys(profile!.dials as object).length ? (profile!.dials as Dials) : { ...DEFAULT_DIALS, ...revealed.dials }}
          initialHardLines={(profile?.hard_lines as HardLines) && Object.keys(profile!.hard_lines as object).length ? (profile!.hard_lines as HardLines) : DEFAULT_HARD_LINES}
          initialBudgetCents={profile?.budget_cents ?? 2000}
        />
      ) : (
        <p className="font-bold">This review is {review.status}.</p>
      )}
    </main>
  );
}
