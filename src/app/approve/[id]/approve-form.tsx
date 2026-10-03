"use client";

import { useState } from "react";
import { DIALS, HARD_LINES, type DialKey, type Dials, type HardLineKey, type HardLines } from "@/lib/glassbox/types";

// BASIC placeholder — Kathryn's drag-to-rank design replaces this.
export function ApproveForm(props: { reviewId: string; candidates: string[]; initialDials: Dials; initialHardLines: HardLines; initialBudgetCents: number }) {
  const [ranked, setRanked] = useState(props.candidates);
  const [dials, setDials] = useState(props.initialDials);
  const [hardLines, setHardLines] = useState(props.initialHardLines);
  const [budget, setBudget] = useState(props.initialBudgetCents / 100);
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ranked.length) return;
    const next = [...ranked];
    [next[i], next[j]] = [next[j], next[i]];
    setRanked(next);
  };

  async function decide(kind: "approve" | "reject") {
    setState("busy");
    const res = await fetch(`/api/reviews/${props.reviewId}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: kind === "approve" ? JSON.stringify({ ranked_priorities: ranked, dials, hard_lines: hardLines, budget_cents: Math.round(budget * 100) }) : "{}",
    });
    const body = await res.json();
    setState(res.ok ? "done" : body.error ?? "Failed");
  }

  if (state === "done") return <p className="text-lg font-bold">Done. The agent has its contract.</p>;

  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Your priorities (top = most important)</h2>
      <ol className="space-y-1">
        {ranked.map((name, i) => (
          <li key={name} className="flex items-center gap-2 rounded border p-2">
            <span className="w-5">{i + 1}.</span>
            <span className="flex-1">{name}</span>
            <button className="border px-2" onClick={() => move(i, -1)}>↑</button>
            <button className="border px-2" onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ol>
      <h2 className="font-semibold">Dials</h2>
      {(Object.keys(DIALS) as DialKey[]).map((k) => (
        <label key={k} className="block text-sm">
          <span className="flex justify-between"><span>{DIALS[k].left}</span><span>{DIALS[k].right}</span></span>
          <input className="w-full" type="range" min={0} max={1} step={0.05} value={dials[k]} onChange={(e) => setDials({ ...dials, [k]: Number(e.target.value) })} />
        </label>
      ))}
      <h2 className="font-semibold">Hard lines</h2>
      {(Object.keys(HARD_LINES) as HardLineKey[]).map((k) => (
        <label key={k} className="block">
          <input type="checkbox" checked={hardLines[k]} onChange={(e) => setHardLines({ ...hardLines, [k]: e.target.checked })} /> {HARD_LINES[k]}
          {k === "budget_cap" && (
            <> $<input className="w-20 border" type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></>
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={state === "busy"} onClick={() => decide("approve")}>
          {state === "busy" ? "Working…" : "Approve"}
        </button>
        <button className="rounded border px-4 py-2" disabled={state === "busy"} onClick={() => decide("reject")}>Reject</button>
      </div>
      {state !== "idle" && state !== "busy" && <p className="text-red-600">{state}</p>}
    </section>
  );
}
