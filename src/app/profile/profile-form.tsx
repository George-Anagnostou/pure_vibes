"use client";

import { useState, type FormEvent } from "react";
import { samePriority } from "@/components/align-data";
import { RankList, type RankItem } from "@/components/rank-list";
import { DEFAULT_DIALS, DEFAULT_HARD_LINES } from "@/lib/glassbox/types";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

// Names are unique (adds are de-duplicated), so they double as stable ids.
const toItem = (name: string): RankItem => ({ id: name, name });
const dedupe = (names: string[]) =>
  names.filter((n, i) => !names.slice(0, i).some((m) => samePriority(m, n)));

export function ProfileForm(props: {
  initialRanked: string[];
  // Saved alongside the order; passed through unchanged.
  profile: { dials: Json; hard_lines: Json; budget_cents: number } | null;
}) {
  const [items, setItems] = useState(() =>
    dedupe(props.initialRanked).map(toItem),
  );
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const change = (next: RankItem[]) => {
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
    <div className="space-y-4">
      {items.length ? (
        <RankList
          items={items}
          onChange={change}
          onRemove={(id) => change(items.filter((i) => i.id !== id))}
          minItems={0}
        />
      ) : (
        <p className="rounded-xl border-2 border-dashed border-line p-5 text-ink-soft">
          Nothing saved yet. Add what usually matters to you, like Price or
          Privacy.
        </p>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a priority"
          maxLength={100}
          aria-label="Add a priority"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 outline-none focus:border-ink"
        />
        <button
          disabled={!draft.trim()}
          className="min-h-11 rounded-xl border-2 border-ink px-4 font-bold disabled:opacity-40"
        >
          Add
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={status.kind === "saving"}
          className="min-h-12 rounded-xl bg-ink px-6 font-bold text-white hover:bg-ink/85 disabled:opacity-60"
        >
          {status.kind === "saving" ? "Saving…" : "Save"}
        </button>
        {status.kind === "saved" && (
          <p role="status" className="font-semibold text-go">
            Saved.
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="font-semibold text-stop">
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
