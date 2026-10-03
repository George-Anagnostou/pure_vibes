// Shared helpers for the Glass Box Claude Code hooks. No dependencies: Node 18+ only.
// Config comes from the environment (set in .claude/settings.local.json "env"):
//   GLASSBOX_URL        e.g. https://pure-vibes-smoky.vercel.app
//   GLASSBOX_AGENT_KEY  gb_... minted on the Glass Box dashboard

export const base = (
  process.env.GLASSBOX_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
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
  return [
    `Glass Box priority contract for "${latest.task}" (review_id ${latest.review_id}) — BINDING:`,
    `Ranked priorities: ${c.ranked_priorities.map((p, i) => `${i + 1}. ${p}`).join("  ")}`,
    `Hard lines: ${c.hard_lines.join(", ")}`,
    c.added_by_human?.length
      ? `Added by the human (you missed these): ${c.added_by_human.join(", ")}`
      : "",
    `Plan guidance: ${c.plan_guidance}`,
    c.instructions,
  ]
    .filter(Boolean)
    .join("\n");
}
