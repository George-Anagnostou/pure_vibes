#!/usr/bin/env node
// PreToolUse hook: a hard stop the agent can't talk around. Risky tool calls
// (network fetches, contacting people, provisioning, spending, destructive commands)
// are sent to Glass Box `checkpoint` against the human's approved contract.
//   block -> deny the tool call (the reason is shown to the agent)
//   warn  -> ask the human to confirm
//   allow -> proceed
// Routine local work (reading/editing files, tests) never leaves the machine.
import { api, latestContract, readStdin } from "./glassbox-lib.mjs";

const input = await readStdin();
const tool = input.tool_name ?? "";
const args = input.tool_input ?? {};

const URL_RE = /https?:\/\/[^\s'"<>|)]+/;
const RISKY_BASH = [
  { re: /\b(curl|wget|http|xh)\b|https?:\/\//, action: "fetch" },
  {
    re: /\b(sendmail|mailx?|mutt|twilio|slack-cli)\b|api\.sendgrid|hooks\.slack\.com/,
    action: "message",
  },
  {
    re: /\bstripe\b.*\b(charges|payment_intents|checkout)\b|\b(buy|purchase)\b/,
    action: "purchase",
  },
  {
    re: /\b(aws|gcloud|az|terraform|pulumi|kubectl|helm|eksctl|flyctl|docker\s+(run|compose|push))\b|\b(ioredis|redis|elasticache|kafka|rabbitmq)\b/,
    action: "provision",
  },
  {
    re: /\brm\s+-[a-z]*r[a-z]*f|\bgit\s+push\b.*--force|\bdrop\s+(table|database)\b/i,
    action: "delete",
  },
];

function classify() {
  if (tool === "WebFetch")
    return {
      action: "fetch",
      target: String(args.url ?? ""),
      details: { why: args.prompt },
    };
  if (tool === "Bash") {
    const cmd = String(args.command ?? "");
    const hit = RISKY_BASH.find((r) => r.re.test(cmd));
    if (!hit) return null;
    const url = cmd.match(URL_RE)?.[0];
    return {
      action: hit.action,
      target: url ?? cmd.slice(0, 300),
      details: { command: cmd.slice(0, 1000), why: args.description },
    };
  }
  return null;
}

function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const check = classify();
if (!check || !check.target) process.exit(0);

let latest;
try {
  latest = await latestContract();
} catch {
  process.exit(0); // Glass Box unreachable: fail open, the database budget rule still holds.
}
if (!latest || latest.status === "none") process.exit(0);
if (latest.status !== "approved") {
  decide(
    "deny",
    `Glass Box: no approved priority contract yet (review ${latest.review_id} is ${latest.status}). Wait for the human at ${latest.align_url ?? "the align page"}, then call get_contract.`,
  );
}

let result;
try {
  result = await api(`/api/reviews/${latest.review_id}/checkpoint`, {
    method: "POST",
    body: JSON.stringify(check),
  });
} catch {
  process.exit(0);
}
if (!result) process.exit(0);
if (result.decision === "block")
  decide(
    "deny",
    `Glass Box BLOCKED this action. ${result.reason} Do not retry it another way; continue the task within the contract.`,
  );
if (result.decision === "warn") decide("ask", `Glass Box: ${result.reason}`);
process.exit(0);
