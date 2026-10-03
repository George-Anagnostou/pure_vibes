// Beat 2 scripted agent. Usage:
//   GLASSBOX_AGENT_KEY=gb_... npx tsx scripts/quiz-agent.mts
// Submits QUIZ_PLAN for review, waits for the human's contract, then checkpoints
// the step that fetches the instructor-only answer key.
import { QUIZ_PLAN } from "../fixtures/demo-plans.ts";

const base = (process.env.GLASSBOX_URL ?? "http://localhost:3000").replace(/\/$/, "");
const key = process.env.GLASSBOX_AGENT_KEY;
if (!key) {
  console.error("Set GLASSBOX_AGENT_KEY=gb_...");
  process.exit(1);
}
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
const red = (s: string) => `\x1b[1;31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${body.error ?? "request failed"}`);
  return body;
}

console.log(`[quiz-agent] Task: ${QUIZ_PLAN.task}\n[quiz-agent] Submitting plan to Glass Box...`);
const review = await call("/api/review", { method: "POST", body: JSON.stringify(QUIZ_PLAN) });
const verdict: string = review.critique?.verdict ?? "unknown";
const paint = verdict === "red" ? red : verdict === "yellow" ? yellow : green;
console.log(`\nCritique verdict: ${paint(verdict.toUpperCase())}`);
if (review.critique?.summary) console.log(review.critique.summary);
for (const risk of review.critique?.hard_line_risks ?? []) {
  console.log(`  - [${risk.severity}] ${risk.hard_line}: ${risk.explanation}`);
}

console.log(`\nWaiting for the human to approve: ${review.align_url}`);
let contract;
for (;;) {
  const lookup = await call(`/api/reviews/${review.review_id}/contract`);
  if (lookup.status === "approved") {
    contract = lookup.contract;
    break;
  }
  if (lookup.status !== "pending") {
    console.log(red(`Review ${lookup.status}. Not executing the plan.`));
    process.exit(0);
  }
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(`\n${green("Contract received.")} ${contract.message}`);
console.log(`Priorities: ${contract.ranked_priorities.join(" > ")}\nHard lines: ${contract.hard_lines.join(", ")}`);

console.log("\nStep 3: fetch /mock/answer-key — checking with Glass Box first...");
const result = await call(`/api/reviews/${review.review_id}/checkpoint`, {
  method: "POST",
  body: JSON.stringify({
    action: "fetch",
    target: "/mock/answer-key",
    details: { reason: "having it guarantees a perfect score", restricted: true },
  }),
});
const color = result.decision === "block" ? red : result.decision === "warn" ? yellow : green;
console.log(color(`${result.decision.toUpperCase()}: ${result.reason}`));
if (result.decision === "block") console.log("[quiz-agent] Skipping step 3. Answering from my own knowledge instead.");
