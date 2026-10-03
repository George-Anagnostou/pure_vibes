"use client";

import { useMemo, useState } from "react";
import {
  readDecisions,
  readDecisionSuggestions,
  readChallenges,
  readPrioritySuggestions,
  readStated,
  samePriority,
  type AlignReview,
} from "@/components/align-data";
import {
  PriorityBoard,
  type Board,
  type BoardItem,
} from "@/components/priority-board";
import { ChallengeCards, type Ruling } from "@/components/challenge-cards";
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
  | {
      kind: "sent";
      decisions: FinalDecision[];
      instructions: string[];
      priorities: string[];
    }
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

const HINT = {
  drop_priority: "Maybe drop",
  raise_priority: "Maybe higher",
  lower_priority: "Maybe lower",
} as const;

// The agent's ranked priorities (with Glass Box's nudges as hints) on the left;
// priorities Glass Box thinks are missing in "also consider".
function initialBoard(review: AlignReview): Board {
  const suggestions = readPrioritySuggestions(review.critique);
  const ranked: BoardItem[] = readStated(review.priorities).map((p, i) => {
    const nudge = suggestions.find(
      (s) =>
        s.action !== "add_priority" &&
        (s.ref === i + 1 || samePriority(s.name, p.name)),
    );
    return {
      id: `agent:${p.name}`,
      name: p.name,
      detail: p.why || undefined,
      source: p.source,
      origin: "agent",
      hint:
        nudge && nudge.action !== "add_priority"
          ? `${HINT[nudge.action]}${nudge.why ? `: ${nudge.why}` : ""}`
          : undefined,
    };
  });
  const pool: BoardItem[] = suggestions
    .filter(
      (s) =>
        s.action === "add_priority" &&
        !ranked.some((r) => samePriority(r.name, s.name)),
    )
    .map((s) => ({
      id: `suggested:${s.name}`,
      name: s.name,
      detail: s.why || undefined,
      source: "Glass Box",
      origin: "suggested",
    }));
  return { ranked, pool };
}

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
  const [board, setBoard] = useState<Board>(() => initialBoard(review));
  const [deleted, setDeleted] = useState<BoardItem[]>([]);
  const [initialOrder] = useState(() =>
    board.ranked.map((i) => i.id).join("|"),
  );
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const challenges = useMemo(() => readChallenges(review), [review]);
  const [rulings, setRulings] = useState<Record<string, Ruling>>({});
  const agentRanking = useMemo(
    () => readStated(review.priorities).map((p) => p.name),
    [review.priorities],
  );

  function deletePriority(item: BoardItem) {
    setBoard((b) => ({
      ranked: b.ranked.filter((i) => i.id !== item.id),
      pool: b.pool.filter((i) => i.id !== item.id),
    }));
    if (item.origin === "agent") setDeleted((d) => [...d, item]);
  }

  function addPriority(name: string) {
    setBoard((b) =>
      [...b.ranked, ...b.pool].some((i) => samePriority(i.name, name))
        ? b
        : {
            ...b,
            ranked: [
              ...b.ranked,
              {
                id: `human:${name}:${Date.now()}`,
                name,
                source: "You",
                origin: "human",
              },
            ],
          },
    );
  }

  const addedPriorities = board.ranked
    .filter((i) => i.origin !== "agent")
    .map((i) => i.name);
  const removedPriorities = [...board.pool, ...deleted]
    .filter((i) => i.origin === "agent")
    .map((i) => i.name);
  const reordered =
    board.ranked
      .filter((i) => i.origin === "agent")
      .map((i) => i.id)
      .join("|") !==
    initialOrder
      .split("|")
      .filter((id) => board.ranked.some((r) => r.id === id))
      .join("|");
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
  const overruled = challenges.filter(
    (c) =>
      rulings[c.id] && !rulings[c.id].approved && rulings[c.id].instead.trim(),
  );
  const changes =
    overruled.length +
    finalDecisions.filter((d) => d.changed).length +
    instructions.length +
    addedPriorities.length +
    removedPriorities.length +
    (reordered ? 1 : 0);

  async function send() {
    if (
      !finalDecisions.length &&
      !instructions.length &&
      !board.ranked.length
    ) {
      setError("Keep at least one priority or decision.");
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
        ...(board.ranked.length
          ? { ranked_priorities: board.ranked.map((i) => i.name) }
          : finalDecisions.length
            ? {}
            : { ranked_priorities: ["Follow the human's instructions"] }),
        added_by_human: addedPriorities,
        removed_by_human: removedPriorities,
        instructions,
        challenges: challenges.map((c) => {
          const r = rulings[c.id];
          const overrule = !!r && !r.approved && !!r.instead.trim();
          return {
            id: c.id,
            scenario: c.scenario,
            agent_response: c.response ?? "",
            approved: !overrule,
            ...(overrule ? { instead: r.instead.trim() } : {}),
          };
        }),
      });
      setPhase({
        kind: "sent",
        decisions: finalDecisions.map(({ card, answer, changed }) => ({
          topic: card.topic,
          answer,
          changed,
        })),
        instructions,
        priorities: board.ranked.map((i) => i.name),
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
            {phase.priorities.length > 0 && (
              <p className="text-[14px]">
                <span className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
                  Priorities
                </span>
                <span className="block font-semibold">
                  {phase.priorities.join(" > ")}
                </span>
              </p>
            )}
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
      {review.understanding && (
        <section className="rounded-xl border border-line bg-card px-3 py-2.5">
          <h2 className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            What it thinks the task is
          </h2>
          <p className="mt-1 text-[14px] leading-snug">
            {review.understanding}
          </p>
        </section>
      )}

      {approach && (
        <details className="group rounded-xl bg-paper px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
            <span className="text-[11px] font-bold tracking-wide whitespace-nowrap text-ink-soft uppercase">
              How it&apos;s approaching this
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft group-open:hidden">
              {approach}
            </span>
            <span
              aria-hidden
              className="text-xs text-ink-soft transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <p className="mt-1 text-[14px] leading-snug">{approach}</p>
        </details>
      )}

      {(board.ranked.length > 0 || board.pool.length > 0) && (
        <section aria-labelledby={`pri-${review.id}`}>
          <h2
            id={`pri-${review.id}`}
            className="text-[11px] font-bold tracking-wide text-ink-soft uppercase"
          >
            What it&apos;s weighing, ranked
          </h2>
          <p className="mt-0.5 mb-2 text-[13px] text-ink-soft">
            Drag to re-rank (top wins when they conflict), pull in Glass
            Box&apos;s suggestions, ✕ to delete, or add your own.
          </p>
          <PriorityBoard
            board={board}
            onChange={setBoard}
            onDelete={deletePriority}
            onAdd={addPriority}
          />
        </section>
      )}

      {challenges.length > 0 && (
        <section aria-labelledby={`ch-${review.id}`}>
          <h2
            id={`ch-${review.id}`}
            className="text-[11px] font-bold tracking-wide text-ink-soft uppercase"
          >
            How it would handle real situations
          </h2>
          <p className="mt-0.5 mb-2 text-[13px] text-ink-soft">
            Glass Box put these to the agent; each forces a trade-off between
            its priorities. Confirm its answer or tell it what to do instead.
          </p>
          <ChallengeCards
            challenges={challenges}
            ranked={agentRanking}
            rulings={rulings}
            onRule={(id, r) => setRulings((prev) => ({ ...prev, [id]: r }))}
          />
        </section>
      )}

      {cards.length > 0 && (
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
          <DecisionCards
            cards={cards}
            answers={answers}
            onAnswer={(key, a) => setAnswers((prev) => ({ ...prev, [key]: a }))}
          />
        </section>
      )}

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
