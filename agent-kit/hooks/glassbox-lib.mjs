// Shared helpers for the Glass Box Claude Code hooks. No dependencies: Node 18+ only.
// Config comes from the environment (set in .claude/settings.local.json "env"):
//   GLASSBOX_URL        e.g. https://glassbox.cards
//   GLASSBOX_AGENT_KEY  gb_... minted on the Glass Box dashboard

export const base =
  // Same default as install.mjs (the hosted app); the installer always sets GLASSBOX_URL.
  (process.env.GLASSBOX_URL ?? "https://glassbox.cards").replace(/\/$/, "");
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
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json();
}

// The newest review for this agent and its contract (status approved | pending | rejected | none).
export const latestContract = () => api("/api/agent/contract");

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

export function contractContext(latest) {
  if (!latest || latest.status === "none" || isStale(latest)) {
    return NO_CONTRACT;
  }
  if (latest.status === "pending") {
    return `Glass Box: the human has not yet reviewed your plan for "${latest.task}". If that is still the task, show them ${latest.align_url} and call get_contract (review_id ${latest.review_id}) before acting. If the human has asked for something else, call align for the new task.`;
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
