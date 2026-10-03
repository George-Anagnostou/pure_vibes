"use client";

import { useState } from "react";
import {
  readStated,
  readSuggestions,
  samePriority,
  type AlignReview,
  type Suggestion,
} from "@/components/align-data";
import {
  PriorityBoard,
  type Board,
  type BoardItem,
} from "@/components/priority-board";

type Phase =
  | { kind: "editing" }
  | { kind: "busy"; action: "send" | "reject" }
  | { kind: "sent"; ranked: BoardItem[] }
  | { kind: "rejected" };

const HINT: Record<Exclude<Suggestion["action"], "add">, string> = {
  drop: "Maybe drop",
  raise: "Maybe higher",
  lower: "Maybe lower",
};

// Agent priorities start ranked (with Glass Box's nudges as hints); "add"
// suggestions start in the "also consider" column.
function initialBoard(review: AlignReview): Board {
  const suggestions = readSuggestions(review.critique);
  const ranked: BoardItem[] = readStated(review.stated).map((p) => {
    const nudge = suggestions.find(
      (s) => s.action !== "add" && samePriority(s.priority, p.name),
    );
    return {
      id: `agent:${p.name}`,
      name: p.name,
      detail: p.why || undefined,
      source: p.source,
      origin: "agent",
      hint:
        nudge && nudge.action !== "add"
          ? `${HINT[nudge.action]}${nudge.why ? `: ${nudge.why}` : ""}`
          : undefined,
    };
  });
  const pool: BoardItem[] = suggestions
    .filter(
      (s) =>
        s.action === "add" &&
        !ranked.some((r) => samePriority(r.name, s.priority)),
    )
    .map((s) => ({
      id: `suggested:${s.priority}`,
      name: s.priority,
      detail: s.why || undefined,
      source: "Glass Box",
      origin: "suggested",
    }));
  return { ranked, pool };
}

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

// The whole decision in one screen: drag the agent's priorities and Glass Box's
// suggestions into a ranking, send. Used on /align/[id] and in the inbox.
export function AlignPanel({
  review,
  onDone,
}: {
  review: AlignReview;
  onDone?: () => void;
}) {
  const [board, setBoard] = useState<Board>(() => initialBoard(review));
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [error, setError] = useState("");

  async function send() {
    if (!board.ranked.length) {
      setError("Rank at least one priority.");
      return;
    }
    setError("");
    setPhase({ kind: "busy", action: "send" });
    try {
      await post(`/api/reviews/${review.id}/approve`, {
        ranked_priorities: board.ranked.map((i) => i.name),
        added_by_human: board.ranked
          .filter((i) => i.origin === "suggested")
          .map((i) => i.name),
        removed_by_human: board.pool
          .filter((i) => i.origin === "agent")
          .map((i) => i.name),
      });
      setPhase({ kind: "sent", ranked: board.ranked });
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
                {review.agent_name} will follow your order.
              </p>
            </div>
            <FinalList
              names={phase.ranked.map((i) => i.name)}
              added={phase.ranked
                .filter((i) => i.origin === "suggested")
                .map((i) => i.name)}
            />
          </>
        ) : (
          <div>
            <p className="text-2xl font-black tracking-tight">Rejected.</p>
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

  return (
    <div className="space-y-6">
      <section aria-labelledby={`rank-${review.id}`}>
        {review.plan && !review.plan.startsWith("(no step-by-step plan") && (
          <details className="mb-3 rounded-xl border border-line bg-card px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold">
              What it&apos;s thinking
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-ink-soft">
              {review.plan}
            </p>
          </details>
        )}
        <p id={`rank-${review.id}`} className="text-sm text-ink-soft">
          Everything steering {review.agent_name}. Drag to rank, pull ideas in
          from the right, or drag one out to drop it.
        </p>
        <div className="mt-3">
          <PriorityBoard board={board} onChange={setBoard} />
        </div>
      </section>

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
          ) : (
            `Send to ${review.agent_name}`
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
              ? "Rejecting…"
              : "Reject this request"}
          </button>
        </p>
      </div>
    </div>
  );
}

export function FinalList({
  names,
  added = [],
}: {
  names: string[];
  added?: string[];
}) {
  return (
    <ol className="space-y-2">
      {names.map((name, i) => (
        <li
          key={`${name}-${i}`}
          className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-3"
        >
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${i === 0 ? "bg-ink text-white" : "bg-paper"}`}
          >
            {i + 1}
          </span>
          <span className="font-semibold">{name}</span>
          {added.some((a) => samePriority(a, name)) && (
            <span className="rounded-full bg-go-bg px-2 py-0.5 text-xs font-semibold text-go">
              Added
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
