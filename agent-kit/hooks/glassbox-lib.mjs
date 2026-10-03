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

export function contractContext(latest) {
  if (!latest || latest.status === "none") {
    return "Glass Box: no priority contract yet. Before executing a multi-step plan, call the glassbox `align` tool with your task, plan and your own ranked priorities.";
  }
  if (latest.status === "pending") {
    return `Glass Box: the human has not yet ranked priorities for "${latest.task}". Show them ${latest.align_url} and call get_contract (review_id ${latest.review_id}) before acting.`;
  }
  if (latest.status !== "approved") {
    return `Glass Box: the human ${latest.status} your last plan ("${latest.task}"). Do not execute it; call align with a revised plan.`;
  }
  const c = latest.contract;
  const decisions = (c.decisions ?? []).map(
    (d) =>
      `- ${d.topic}: ${d.decision}${d.changed_by_human ? " (changed by the human)" : ""}`,
  );
  return [
    `Glass Box contract for "${latest.task}" (review_id ${latest.review_id}) — BINDING. The human decided:`,
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
