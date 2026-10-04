"use client";

import { useState, type FormEvent } from "react";
import {
  readPrioritySuggestions,
  readStated,
  samePriority,
  type AlignReview,
} from "@/components/align-data";
import type { Board, BoardItem } from "@/components/priority-board";
import styles from "@/components/glassbox/glassbox.module.css";
import local from "@/components/glassbox/align.module.css";
import { PlusIcon } from "@/components/glassbox/plus-icon";
import { RankedPriorities } from "@/components/glassbox/ranked-priorities";

type Phase =
  | { kind: "editing" }
  | { kind: "busy"; action: "send" | "reject" }
  | { kind: "sent"; priorities: string[] }
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

// The whole review in one screen, on Kathryn's design system (DESIGN.md): the agent's
// ranked priorities (drag, remove, pull in Glass Box's suggestions or add your own),
// what it thinks the task is, then Continue. Used on /align/[id] and in the inbox
// sheet. Older reviews may carry challenges/decisions; this view ignores them.
export function AlignPanel({
  review,
  onDone,
  compact = false,
}: {
  review: AlignReview;
  onDone?: () => void;
  compact?: boolean; // single column (inbox sheet)
}) {
  const [board, setBoard] = useState<Board>(() => initialBoard(review));
  const [deleted, setDeleted] = useState<BoardItem[]>([]);
  const [initialOrder] = useState(() =>
    board.ranked.map((i) => i.id).join("|"),
  );

  // Removing a Glass Box suggestion puts it back in the optional list.
  function deletePriority(item: BoardItem) {
    setBoard((b) => ({
      ranked: b.ranked.filter((i) => i.id !== item.id),
      pool:
        item.origin === "suggested" && !b.pool.some((i) => i.id === item.id)
          ? [...b.pool, item]
          : b.pool.filter((i) => i.id !== item.id),
    }));
    if (item.origin === "agent") setDeleted((d) => [...d, item]);
  }

  function pullIn(item: BoardItem) {
    setBoard((b) => ({
      ranked: [...b.ranked, item],
      pool: b.pool.filter((i) => i.id !== item.id),
    }));
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
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [error, setError] = useState("");

  const changes =
    addedPriorities.length + removedPriorities.length + (reordered ? 1 : 0);

  async function send() {
    if (!board.ranked.length) {
      setError("Keep at least one priority.");
      return;
    }
    setError("");
    setPhase({ kind: "busy", action: "send" });
    const priorities = board.ranked.map((i) => i.name);
    try {
      await post(`/api/reviews/${review.id}/approve`, {
        ranked_priorities: priorities,
        added_by_human: addedPriorities,
        removed_by_human: removedPriorities,
      });
      setPhase({ kind: "sent", priorities });
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
      <div role="status" className={styles.confirm}>
        <div className={styles.confirmMark} aria-hidden>
          {phase.kind === "sent" ? "✓" : "✕"}
        </div>
        <h2 className={styles.confirmTitle}>
          {phase.kind === "sent" ? `Sent to ${review.agent_name}` : "Stopped"}
        </h2>
        <p className={styles.confirmSub}>
          {phase.kind === "sent"
            ? "It will follow your priorities and check in before anything risky."
            : `${review.agent_name} won't go ahead with this.`}
        </p>
        {phase.kind === "sent" && (
          <FinalDecisions priorities={phase.priorities} />
        )}
        {onDone && (
          <div className={styles.submitBar}>
            <button
              type="button"
              onClick={onDone}
              className={styles.btnSecondary}
            >
              Done
            </button>
          </div>
        )}
      </div>
    );
  }

  // Decided somewhere else (another tab/device) while this was open.
  if (phase.kind === "editing" && review.status !== "pending") {
    return (
      <div role="status" className={styles.confirm}>
        <p className={styles.confirmSub}>
          This request was already{" "}
          {review.status === "approved" ? "sent" : review.status} from another
          window.
        </p>
        {onDone && (
          <div className={styles.submitBar}>
            <button
              type="button"
              onClick={onDone}
              className={styles.btnSecondary}
            >
              Close
            </button>
          </div>
        )}
      </div>
    );
  }

  const busy = phase.kind === "busy";
  const approach =
    review.plan && !review.plan.startsWith("(no ") ? review.plan : "";

  function submitOwn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("own") as HTMLInputElement;
    const name = input.value.trim().slice(0, 120);
    if (!name) return;
    addPriority(name);
    input.value = "";
  }

  return (
    <div
      className={
        compact ? local.compact : `${styles.alignLayout} ${local.desktop}`
      }
    >
      <div>
        <section className={styles.card} aria-labelledby={`pri-${review.id}`}>
          <h2 id={`pri-${review.id}`} className={styles.cardTitle}>
            Your priorities
          </h2>
          <p className={styles.cardHint}>
            Drag to reorder. #1 wins every conflict. Tap a tile to remove it.
          </p>
          {board.ranked.length ? (
            <RankedPriorities
              items={board.ranked}
              onChange={(ranked) => setBoard((b) => ({ ...b, ranked }))}
              onRemove={deletePriority}
            />
          ) : (
            <p className={`${styles.cardHint} ${local.empty}`}>
              No priorities left. Add one from the list.
            </p>
          )}
        </section>

        {/* Agent context sits at the bottom of the stack (Kathryn). */}
        {(review.understanding || approach) && (
          <div className={local.contextList}>
            {review.understanding && (
              <Context title="What i think the task is">
                {review.understanding}
              </Context>
            )}
            {approach && (
              <Context title="How i'll approach it">{approach}</Context>
            )}
          </div>
        )}
      </div>

      <aside className={styles.sideSticky}>
        <div className={styles.optCard}>
          <p className={styles.optCardTitle}>Worth adding</p>
          <div className={styles.optList}>
            {board.pool.length === 0 && (
              <p className={local.empty}>
                Glass Box has no other suggestions. Add your own below.
              </p>
            )}
            {board.pool.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.optRow}
                onClick={() => pullIn(item)}
              >
                <PlusIcon className={styles.sugChipIcon} />
                <span className={styles.optRowBody}>
                  <span>{item.name}</span>
                  {item.detail && (
                    <span className={styles.optRowReason}>{item.detail}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <form className={local.addForm} onSubmit={submitOwn}>
            <input
              name="own"
              className={local.addInput}
              placeholder="Add your own priority"
              aria-label="Add your own priority"
              maxLength={120}
            />
            <button type="submit" className={local.addButton}>
              Add
            </button>
          </form>
        </div>

        {error && (
          <p role="alert" className={local.error}>
            {error}
          </p>
        )}
        <div className={styles.submitBar}>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className={styles.submit}
          >
            {phase.kind === "busy" && phase.action === "send" ? (
              <span className="gb-pulse">Sending…</span>
            ) : changes ? (
              `Send ${changes} change${changes === 1 ? "" : "s"} to ${review.agent_name}`
            ) : (
              "Continue"
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={reject}
          disabled={busy}
          className={styles.btnSecondary}
        >
          {phase.kind === "busy" && phase.action === "reject"
            ? "Stopping…"
            : "Stop, don't do this"}
        </button>
      </aside>
    </div>
  );
}

// One line until tapped, then the full text.
function Context({ title, children }: { title: string; children: string }) {
  return (
    <details className={local.disclosure}>
      <summary className={local.disclosureSummary}>
        <span className={local.disclosureTitle}>{title}</span>
        <span className={local.disclosurePreview}>{children}</span>
        <svg
          className={local.disclosureChevron}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </summary>
      <p className={local.disclosureBody}>{children}</p>
    </details>
  );
}

export function FinalDecisions({ priorities }: { priorities: string[] }) {
  if (!priorities.length) return null;
  return (
    <ul className={local.summary}>
      <li className={local.summaryItem}>
        <span className={local.summaryLabel}>Priorities</span>
        <span className={local.summaryValue}>{priorities.join(" > ")}</span>
      </li>
    </ul>
  );
}
