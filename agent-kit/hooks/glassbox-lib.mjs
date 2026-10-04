// Shared helpers for the Glass Box Claude Code hooks. No dependencies: Node 18+ only.
// Config comes from the environment (set in .claude/settings.local.json "env"):
//   GLASSBOX_URL        e.g. https://glass-box-app.vercel.app
//   GLASSBOX_AGENT_KEY  gb_... minted on the Glass Box dashboard

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const base =
  // The hosted app (install.mjs sets GLASSBOX_URL explicitly; this is only a fallback).
  (process.env.GLASSBOX_URL ?? "https://glass-box-app.vercel.app").replace(
    /\/$/,
    "",
  );
const key = process.env.GLASSBOX_AGENT_KEY;

export async function readStdin() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export async function api(path, init = {}) {
  if (!key) return null;
  const { timeoutMs = 8000, ...rest } = init;
  const res = await fetch(`${base}${path}`, {
    ...rest,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  return res.json();
}

// The newest review for this agent and its contract (status approved | pending | rejected | none).
export const latestContract = () => api("/api/agent/contract");

// Last status each hook saw per review, so a hook can tell the agent "the human has
// just answered" when a review flips from pending. Best effort: lives in the OS temp dir.
const stateDir = join(tmpdir(), "glassbox-hooks");
const statePath = (reviewId) =>
  join(stateDir, `${String(reviewId).replace(/[^0-9a-f-]/gi, "")}.json`);
export function seenStatus(reviewId) {
  try {
    return JSON.parse(readFileSync(statePath(reviewId), "utf8")).status;
  } catch {
    return undefined;
  }
}
export function rememberStatus(reviewId, status) {
  if (!reviewId) return;
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(statePath(reviewId), JSON.stringify({ status }));
  } catch {
    // ignore: only affects wording
  }
}

// A review left pending this long was abandoned; an approved contract this old
// belongs to an earlier task. Neither should steer or block today's work.
const PENDING_STALE_MS = 2 * 60 * 60 * 1000;
const DECIDED_STALE_MS = 24 * 60 * 60 * 1000;
export function isStale(latest, now = Date.now()) {
  if (!latest || latest.status === "none") return false;
  const pending = latest.status === "pending";
  const at = Date.parse(pending ? latest.created_at : latest.decided_at);
  if (Number.isNaN(at)) return false; // older servers send no timestamps
  return now - at > (pending ? PENDING_STALE_MS : DECIDED_STALE_MS);
}

const NO_CONTRACT =
  "Glass Box: before acting on a task with real choices (scope, data sources, cost, time, quality, risk), call the glassbox `align` tool with the task, your approach and your ranked priorities, and wait for the human's contract.";

// justAnswered: the review was pending the last time a hook looked, so the agent may
// still be waiting on it. Say plainly that the answer is in.
export function contractContext(latest, { justAnswered = false } = {}) {
  if (!latest || latest.status === "none" || isStale(latest)) {
    return NO_CONTRACT;
  }
  if (latest.status === "pending") {
    return `Glass Box: the human has not answered yet on your plan for "${latest.task}". If that is still the task, show them ${latest.align_url} once and call get_contract (review_id ${latest.review_id}) again and again until it is approved or rejected; do not act before that. If the human has asked for something else, call align for the new task.`;
  }
  if (latest.status !== "approved") {
    return `Glass Box: the human ${latest.status} your last plan ("${latest.task}"). Do not execute it; call align with a revised plan, or align on the new task if the human has asked for something else.`;
  }
  const c = latest.contract;
  const decisions = (c.decisions ?? []).map(
    (d) =>
      `- ${d.topic}: ${d.decision}${d.changed_by_human ? " (changed by the human)" : ""}`,
  );
  return [
    justAnswered
      ? `Glass Box: the human has answered your plan for "${latest.task}" and approved it. Here is the contract; stop waiting and follow it.`
      : "",
    c.message ? `What the human changed: ${c.message}` : "",
    (c.ranked_priorities ?? []).length
      ? `Ranked priorities (first wins): ${c.ranked_priorities.join(" > ")}`
      : "",
    `Glass Box contract for "${latest.task}" (review_id ${latest.review_id}). It is BINDING for that task only: if the human's current request is a different task with real choices, call align for it first. The human decided:`,
    ...decisions,
    c.instructions_from_human?.length
      ? `The human also told you: ${c.instructions_from_human.join("; ")}`
      : "",
    `Hard lines: ${c.hard_lines.join(", ")}`,
    `Plan guidance: ${c.plan_guidance}`,
    c.instructions,
  ]
    .filter(Boolean)
    .join("\n");
}
