"use client";

import { useMemo, useState } from "react";
import {
  readDecisions,
  readDecisionSuggestions,
  type AlignReview,
} from "@/components/align-data";
import {
  answerFor,
  buildCards,
  DecisionCards,
  ExtraInstructions,
  type Answer,
} from "@/components/decision-cards";

export type FinalDecision = { topic: string; answer: string; changed: boolean };

type Phase =
  | { kind: "editing" }
  | { kind: "busy"; action: "send" | "reject" }
  | { kind: "sent"; decisions: FinalDecision[]; instructions: string[] }
  | { kind: "rejected" };

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401)
    throw new Error("Your session expired. Sign in again, then retry.");
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// The whole review in one screen: how the agent is approaching the task, the
// decisions it's making for you (keep, switch, or say what you want), anything else
// it should know, send. Used on /align/[id] and in the inbox.
export function AlignPanel({
  review,
  onDone,
}: {
  review: AlignReview;
  onDone?: () => void;
}) {
  const cards = useMemo(
    () =>
      buildCards(
        readDecisions(review.stated),
        readDecisionSuggestions(review.critique),
      ),
    [review.stated, review.critique],
  );
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [instructions, setInstructions] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [error, setError] = useState("");

  // Every decision with its final answer; Glass Box cards count only if answered.
  const finalDecisions = cards.flatMap((card) => {
    const answer = answerFor(card, answers[card.key]);
    if (!answer) return [];
    const changed = card.agentChoice ? !same(answer, card.agentChoice) : true;
    return [{ card, answer, changed }];
  });
  const changes =
    finalDecisions.filter((d) => d.changed).length + instructions.length;

  async function send() {
    if (!finalDecisions.length && !instructions.length) {
      setError("Answer at least one decision.");
      return;
    }
    setError("");
    setPhase({ kind: "busy", action: "send" });
    try {
      await post(`/api/reviews/${review.id}/approve`, {
        decisions: finalDecisions.map(({ card, answer, changed }) => ({
          topic: card.topic,
          question: card.question,
          answer,
          ...(card.agentChoice ? { agent_choice: card.agentChoice } : {}),
          changed,
        })),
        ...(finalDecisions.length
          ? {}
          : { ranked_priorities: ["Follow the human's instructions"] }),
        added_by_human: instructions,
      });
      setPhase({
        kind: "sent",
        decisions: finalDecisions.map(({ card, answer, changed }) => ({
          topic: card.topic,
          answer,
          changed,
        })),
        instructions,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send.");
      setPhase({ kind: "editing" });
    }
  }

  async function reject() {
    setError("");
    setPhase({ kind: "busy", action: "reject" });
    try {
      await post(`/api/reviews/${review.id}/reject`, {});
      setPhase({ kind: "rejected" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reject.");
      setPhase({ kind: "editing" });
    }
  }

  if (phase.kind === "sent" || phase.kind === "rejected") {
    return (
      <div role="status" className="space-y-5">
        {phase.kind === "sent" ? (
          <>
            <div>
              <p className="text-2xl font-black tracking-tight">Sent.</p>
              <p className="mt-1 text-ink-soft">
                {review.agent_name} will follow your decisions.
              </p>
            </div>
            <FinalDecisions
              decisions={phase.decisions}
              instructions={phase.instructions}
            />
          </>
        ) : (
          <div>
            <p className="text-2xl font-black tracking-tight">Stopped.</p>
            <p className="mt-1 text-ink-soft">
              {review.agent_name} won&apos;t go ahead with this.
            </p>
          </div>
        )}
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="min-h-12 w-full rounded-xl border-2 border-ink font-bold"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  // Decided somewhere else (another tab/device) while this was open.
  if (phase.kind === "editing" && review.status !== "pending") {
    return (
      <div role="status" className="space-y-5">
        <p className="text-ink-soft">
          This request was already{" "}
          {review.status === "approved" ? "sent" : review.status} from another
          window.
        </p>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="min-h-12 w-full rounded-xl border-2 border-ink font-bold"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  const busy = phase.kind === "busy";
  const approach =
    review.plan && !review.plan.startsWith("(no ") ? review.plan : "";

  return (
    <div className="space-y-5">
      {approach && (
        <section className="rounded-xl bg-paper px-3 py-2.5">
          <h2 className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            How it&apos;s approaching this
          </h2>
          <p className="mt-1 text-[14px] leading-snug">{approach}</p>
        </section>
      )}

      <section aria-labelledby={`dec-${review.id}`}>
        <h2
          id={`dec-${review.id}`}
          className="text-[11px] font-bold tracking-wide text-ink-soft uppercase"
        >
          Decisions it&apos;s making for you
        </h2>
        <p className="mt-0.5 mb-2 text-[13px] text-ink-soft">
          Keep its choice, pick another, or tell it what you actually want.
        </p>
        {cards.length ? (
          <DecisionCards
            cards={cards}
            answers={answers}
            onAnswer={(key, a) => setAnswers((prev) => ({ ...prev, [key]: a }))}
          />
        ) : (
          <p className="rounded-xl border-2 border-dashed border-line p-4 text-sm text-ink-soft">
            The agent didn&apos;t list any decisions. Tell it what you want
            below.
          </p>
        )}
      </section>

      <ExtraInstructions items={instructions} onChange={setInstructions} />

      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-sm font-semibold text-stop">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="min-h-14 w-full rounded-xl bg-ink px-5 text-lg font-bold text-white hover:bg-ink/85 disabled:opacity-70"
        >
          {phase.kind === "busy" && phase.action === "send" ? (
            <span className="gb-pulse">Sending…</span>
          ) : changes ? (
            `Send ${changes} change${changes === 1 ? "" : "s"} to ${review.agent_name}`
          ) : (
            `Looks right, send to ${review.agent_name}`
          )}
        </button>
        <p className="text-center">
          <button
            type="button"
            onClick={reject}
            disabled={busy}
            className="text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-stop disabled:opacity-60"
          >
            {phase.kind === "busy" && phase.action === "reject"
              ? "Stopping…"
              : "Stop, don't do this"}
          </button>
        </p>
      </div>
    </div>
  );
}

export function FinalDecisions({
  decisions,
  instructions = [],
}: {
  decisions: FinalDecision[];
  instructions?: string[];
}) {
  return (
    <ul className="space-y-1.5">
      {decisions.map((d) => (
        <li
          key={d.topic}
          className="rounded-xl border border-line bg-card px-3 py-2 text-[14px]"
        >
          <span className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            {d.topic}
          </span>
          {d.changed && (
            <span className="ml-1.5 rounded bg-ink px-1 py-px text-[10px] font-semibold text-white uppercase">
              Changed
            </span>
          )}
          <span className="block font-semibold">{d.answer}</span>
        </li>
      ))}
      {instructions.map((t) => (
        <li
          key={t}
          className="rounded-xl border border-dashed border-line bg-card px-3 py-2 text-[14px]"
        >
          <span className="text-[11px] font-bold tracking-wide text-go uppercase">
            You added
          </span>
          <span className="block font-semibold">{t}</span>
        </li>
      ))}
    </ul>
  );
}
