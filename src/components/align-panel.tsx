"use client";

import { useState } from "react";
import {
  readStated,
  readSuggestions,
  samePriority,
  type AlignReview,
  type Suggestion,
} from "@/components/align-data";
import { RankList, type RankItem } from "@/components/rank-list";

const AGENT = "agent:";

type Phase =
  | { kind: "editing" }
  | { kind: "busy"; action: "send" | "reject" }
  | { kind: "sent"; ranked: RankItem[] }
  | { kind: "rejected" };

type Decision = "accepted" | "dismissed";

const ACTION_LABEL: Record<Suggestion["action"], string> = {
  add: "Add",
  drop: "Drop",
  raise: "Raise",
  lower: "Lower",
};

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

// The whole decision in one screen: re-rank the agent's priorities, accept or
// dismiss Glass Box's suggestions, send. Used on /align/[id] and in the inbox.
export function AlignPanel({
  review,
  onDone,
}: {
  review: AlignReview;
  onDone?: () => void;
}) {
  const [items, setItems] = useState<RankItem[]>(() =>
    readStated(review.stated).map((p) => ({
      id: `${AGENT}${p.name}`,
      name: p.name,
      detail: p.why || undefined,
    })),
  );
  const [suggestions] = useState(() => readSuggestions(review.critique));
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [error, setError] = useState("");

  const indexOf = (list: RankItem[], name: string) =>
    list.findIndex((i) => samePriority(i.name, name));

  function remove(list: RankItem[], id: string) {
    const item = list.find((i) => i.id === id);
    if (item?.id.startsWith(AGENT))
      setRemoved((prev) => [...new Set([...prev, item.name])]);
    return list.filter((i) => i.id !== id);
  }

  function accept(index: number, s: Suggestion) {
    let next = items;
    const at = indexOf(items, s.priority);
    if (s.action === "add") {
      if (at === -1)
        next = [
          ...items,
          { id: `human:${s.priority}`, name: s.priority, tag: "Added" },
        ];
    } else if (at !== -1) {
      if (s.action === "drop") {
        if (items.length <= 1) {
          setError("Keep at least one priority.");
          return;
        }
        next = remove(items, items[at].id);
      } else {
        const [moved] = items.slice(at, at + 1);
        const rest = items.filter((_, i) => i !== at);
        next = s.action === "raise" ? [moved, ...rest] : [...rest, moved];
      }
    }
    setError("");
    setItems(next);
    setDecisions((d) => ({ ...d, [index]: "accepted" }));
  }

  async function send() {
    if (!items.length) {
      setError("Keep at least one priority.");
      return;
    }
    setError("");
    setPhase({ kind: "busy", action: "send" });
    const ranked = items.map((i) => i.name);
    try {
      await post(`/api/reviews/${review.id}/approve`, {
        ranked_priorities: ranked,
        added_by_human: items
          .filter((i) => !i.id.startsWith(AGENT))
          .map((i) => i.name),
        removed_by_human: removed.filter((r) => indexOf(items, r) === -1),
      });
      setPhase({ kind: "sent", ranked: items });
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
            <FinalList names={phase.ranked.map((i) => i.name)} />
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
  const open = suggestions
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !decisions[i]);

  return (
    <div className="space-y-7">
      <section aria-labelledby={`rank-${review.id}`}>
        <h2
          id={`rank-${review.id}`}
          className="text-sm font-bold tracking-wide text-ink-soft uppercase"
        >
          What it&apos;s prioritizing
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Drag to reorder. The top one wins when they conflict.
        </p>
        <div className="mt-3">
          {items.length ? (
            <RankList
              items={items}
              onChange={setItems}
              onRemove={(id) => setItems(remove(items, id))}
            />
          ) : (
            <p className="rounded-xl border-2 border-dashed border-line p-4 text-ink-soft">
              The agent didn&apos;t list any priorities. Accept a suggestion
              below to add one.
            </p>
          )}
        </div>
      </section>

      {open.length > 0 && (
        <section aria-labelledby={`sugg-${review.id}`}>
          <h2
            id={`sugg-${review.id}`}
            className="text-sm font-bold tracking-wide text-ink-soft uppercase"
          >
            Glass Box suggests
          </h2>
          <ul className="mt-3 space-y-2">
            {open.map(({ s, i }) => (
              <SuggestionCard
                key={i}
                suggestion={s}
                onAccept={() => accept(i, s)}
                onDismiss={() =>
                  setDecisions((d) => ({ ...d, [i]: "dismissed" }))
                }
              />
            ))}
          </ul>
        </section>
      )}

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

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const add = suggestion.action === "add";
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <p className="font-bold">
        <span className={add ? "text-go" : "text-ink-soft"}>
          {add ? "+ " : ""}
          {ACTION_LABEL[suggestion.action]}
        </span>{" "}
        {suggestion.priority}
      </p>
      {suggestion.why && (
        <p className="mt-1 text-sm text-ink-soft">{suggestion.why}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="min-h-10 flex-1 rounded-lg bg-ink px-3 text-sm font-bold text-white hover:bg-ink/85"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-10 flex-1 rounded-lg border border-line px-3 text-sm font-bold text-ink-soft hover:border-ink hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </li>
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
