"use client";

import { useState, type FormEvent } from "react";
import { samePriority } from "@/components/align-data";
import styles from "@/components/glassbox/glassbox.module.css";
import { RankedPriorities } from "@/components/glassbox/ranked-priorities";
import type { BoardItem } from "@/components/priority-board";
import { DEFAULT_DIALS, DEFAULT_HARD_LINES } from "@/lib/glassbox/types";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

// Names are unique (adds are de-duplicated), so they double as stable ids.
const toItem = (name: string): BoardItem => ({
  id: name,
  name,
  origin: "human",
});
const dedupe = (names: string[]) =>
  names.filter((n, i) => !names.slice(0, i).some((m) => samePriority(m, n)));

export function ProfileForm(props: {
  initialRanked: string[];
  // Saved alongside the order; passed through unchanged.
  profile: { dials: Json; hard_lines: Json; budget_cents: number } | null;
}) {
  const [items, setItems] = useState<BoardItem[]>(() =>
    dedupe(props.initialRanked).map(toItem),
  );
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const change = (next: BoardItem[]) => {
    setItems(next);
    setStatus({ kind: "idle" });
  };

  function add(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim().slice(0, 100);
    if (!name || items.some((i) => samePriority(i.name, name))) return;
    change([...items, toItem(name)]);
    setDraft("");
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const { error } = await createClient().rpc("save_profile", {
        p_ranked_priorities: items.map((i) => i.name) as Json,
        p_dials: props.profile?.dials ?? (DEFAULT_DIALS as Json),
        p_hard_lines: props.profile?.hard_lines ?? (DEFAULT_HARD_LINES as Json),
        p_budget_cents: props.profile?.budget_cents ?? 2000,
      });
      if (error) throw new Error(error.message);
      setStatus({ kind: "saved" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Could not save. Try again.",
      });
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {items.length ? (
        <RankedPriorities
          items={items}
          onChange={change}
          onRemove={(item) => change(items.filter((i) => i.id !== item.id))}
        />
      ) : (
        <div className={styles.optCard}>
          <p className={styles.smallBody} style={{ margin: 0 }}>
            Nothing saved yet. Add what usually matters to you, like Price or
            Privacy.
          </p>
        </div>
      )}
      <form onSubmit={add} className={styles.inlineForm}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a priority"
          maxLength={100}
          aria-label="Add a priority"
          className={styles.fieldInput}
        />
        <button disabled={!draft.trim()} className={styles.btnDark}>
          Add
        </button>
      </form>
      <div>
        <button
          type="button"
          onClick={save}
          disabled={status.kind === "saving"}
          className={styles.submit}
        >
          {status.kind === "saving" ? "Saving…" : "Save defaults"}
        </button>
        {status.kind === "saved" && (
          <p
            role="status"
            className={styles.statusCard}
            style={{ marginTop: 10 }}
          >
            Saved. Agents start from this.
          </p>
        )}
        {status.kind === "error" && (
          <p
            role="alert"
            className={styles.alertCard}
            style={{ marginTop: 10 }}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
