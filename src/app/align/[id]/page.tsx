import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  isReady,
  readAnswers,
  readStrings,
  STATUS_LABEL,
} from "@/components/align-data";
import { AlignPanel, FinalDecisions } from "@/components/align-panel";
import { WaitingForAgent } from "@/components/waiting-for-agent";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import styles from "@/components/glassbox/glassbox.module.css";
import local from "@/components/glassbox/align.module.css";
import { glassboxFonts } from "@/components/glassbox/fonts";
import { TopBar } from "@/components/glassbox/top-bar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Glass Box" };

// Headline voice from DESIGN.md: "Here is how i will approach [prompt summary]."
// The summary is the task's first sentence, quoted, so imperatives read naturally.
function summarize(task: string) {
  const first = task.trim().split(/(?<=[.!?])\s/)[0] ?? task;
  const short = first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
  return short.replace(/[.!?]$/, "");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.page} ${glassboxFonts}`}>
      <TopBar />
      {children}
    </div>
  );
}

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
      <Shell>
        <SignInGate
          nextPath={`/align/${id}`}
          title="An agent is waiting on you"
          body="Sign in to check its priorities before it goes ahead."
        />
      </Shell>
    );

  const { data: review, error } = await supabase
    .from("reviews")
    .select(
      "id, agent_name, task, plan, status, stated, priorities, understanding, challenge_answers, answered_at, critique, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error)
    return (
      <Shell>
        <ErrorCard
          title="Could not load this request"
          body="The database did not respond. Refresh to try again."
        />
      </Shell>
    );
  if (!review) notFound();

  const contract =
    review.status === "approved"
      ? (
          await supabase
            .from("contracts")
            .select("decisions, ranked_priorities, notes, challenges")
            .eq("review_id", id)
            .maybeSingle()
        ).data
      : null;

  return (
    <Shell>
      <div className={`${styles.alignShell} ${local.wideShell}`}>
        <h1 className={`${styles.taskHeader} ${styles.pretty}`}>
          Here is how <em>i</em> will approach “{summarize(review.task)}”
        </h1>
        <p className={`${styles.agentName} [overflow-wrap:anywhere]`}>
          {review.agent_name}
          {summarize(review.task) !== review.task.trim() &&
            ` · “${review.task.trim()}”`}
        </p>

        {review.status === "pending" && !isReady(review) ? (
          <WaitingForAgent agentName={review.agent_name} />
        ) : review.status === "pending" ? (
          <AlignPanel review={review} />
        ) : (
          <section className={styles.confirm}>
            <span
              className={`${styles.pill} ${review.status === "approved" ? styles.pillApproved : styles.pillPending}`}
            >
              {STATUS_LABEL[review.status] ?? review.status}
            </span>
            {contract ? (
              <>
                <p className={`${styles.confirmSub} mt-3`}>
                  {review.agent_name} is following your decisions:
                </p>
                <FinalDecisions
                  priorities={readStrings(contract.ranked_priorities)}
                  decisions={readAnswers(contract.decisions)}
                  instructions={(contract.notes ?? "")
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean)}
                />
              </>
            ) : (
              <p className={`${styles.confirmSub} mt-3`}>
                {review.agent_name} won&apos;t go ahead with this.
              </p>
            )}
            <p className="mt-6">
              <Link
                href="/inbox"
                className={`${local.addButton} inline-block py-2`}
              >
                Back to inbox
              </Link>
            </p>
          </section>
        )}
      </div>
    </Shell>
  );
}
