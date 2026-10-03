import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  readAnswers,
  readStrings,
  STATUS_LABEL,
} from "@/components/align-data";
import { AlignPanel, FinalDecisions } from "@/components/align-panel";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Glass Box" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AlignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <SignInGate
        nextPath={`/align/${id}`}
        title="An agent is waiting on you"
        body="Sign in to check its priorities before it goes ahead."
      />
    );

  const { data: review, error } = await supabase
    .from("reviews")
    .select(
      "id, agent_name, task, plan, status, stated, priorities, critique, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error)
    return (
      <ErrorCard
        title="Could not load this request"
        body="The database did not respond. Refresh to try again."
      />
    );
  if (!review) notFound();

  const contract =
    review.status === "approved"
      ? (
          await supabase
            .from("contracts")
            .select("decisions, added_by_human")
            .eq("review_id", id)
            .maybeSingle()
        ).data
      : null;

  return (
    <main className="mx-auto max-w-lg px-4 pt-6 pb-16">
      <p className="text-lg leading-snug [overflow-wrap:anywhere]">
        <strong className="font-black">{review.agent_name}</strong> is about to:{" "}
        {review.task}
      </p>

      <div className="mt-6">
        {review.status === "pending" ? (
          <AlignPanel review={review} />
        ) : (
          <section className="space-y-4">
            <p className="inline-block rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
              {STATUS_LABEL[review.status] ?? review.status}
            </p>
            {contract ? (
              <>
                <p className="text-ink-soft">
                  {review.agent_name} is following your decisions:
                </p>
                <FinalDecisions
                  decisions={readAnswers(contract.decisions)}
                  instructions={readStrings(contract.added_by_human)}
                />
              </>
            ) : (
              <p className="text-ink-soft">
                {review.agent_name} won&apos;t go ahead with this.
              </p>
            )}
            <Link
              href="/inbox"
              className="inline-block text-sm font-semibold underline underline-offset-4"
            >
              Back to inbox
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
