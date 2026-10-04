#!/usr/bin/env node
// Stop hook: don't let the agent end its turn while the human is still deciding.
// Humans often take minutes to answer the Glass Box pop-up, longer than one
// get_contract call waits, and agents tend to give up after a few pending replies.
// If this session's latest review is still pending (and recent), the hook first waits
// a little itself, then blocks the stop and tells the agent to call get_contract again.
// When the human answers during that wait, it hands the agent the news directly.
//
// Loop safety: only reviews this session created (its review_id is in the transcript),
// only while the review is younger than MAX_WAIT_MS, and at most MAX_BLOCKS blocks per
// review. Unreachable server or any error: allow the stop.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contractContext,
  latestContract,
  readStdin,
  rememberStatus,
  seenStatus,
} from "./glassbox-lib.mjs";

const MAX_WAIT_MS = 20 * 60 * 1000; // stop nagging once a review is this old
const MAX_BLOCKS = 40; // per review, across stop attempts
// Wait here before blocking (hook timeout is 90s). Overridable for tests.
const HOOK_POLL_MS = Number(process.env.GLASSBOX_STOP_POLL_MS) || 45_000;

const allow = () => process.exit(0);
const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
};

const input = await readStdin();
let latest;
try {
  latest = await latestContract();
} catch {
  allow();
}
if (!latest?.review_id) allow();
const id = latest.review_id;

// Only this session's review: another window's pending review must not trap this one.
let transcript = "";
try {
  if (input.transcript_path && existsSync(input.transcript_path))
    transcript = readFileSync(input.transcript_path, "utf8");
} catch {
  // fall through: unreadable transcript means we can't tell, so allow
}
const ours =
  transcript.includes(id) ||
  String(input.last_assistant_message ?? "").includes(id);
if (!ours) allow();

const created = Date.parse(latest.created_at ?? "");
const age = Number.isNaN(created) ? Infinity : Date.now() - created;

// Count blocks per review so stop_hook_active loops always end.
const countPath = join(tmpdir(), "glassbox-hooks", `${id}.stops`);
let blocks = 0;
try {
  blocks = Number(readFileSync(countPath, "utf8")) || 0;
} catch {
  blocks = 0;
}
const countBlock = () => {
  try {
    mkdirSync(join(tmpdir(), "glassbox-hooks"), { recursive: true });
    writeFileSync(countPath, String(blocks + 1));
  } catch {
    // ignore
  }
};

if (latest.status === "pending") {
  if (age > MAX_WAIT_MS || blocks >= MAX_BLOCKS) allow();
  rememberStatus(id, "pending");
  // Wait here a while first: if the human answers, the agent gets it straight away.
  const until = Date.now() + HOOK_POLL_MS;
  while (latest?.status === "pending" && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      latest = (await latestContract()) ?? latest;
    } catch {
      // keep the last answer
    }
    if (latest?.review_id !== id) allow(); // a newer review appeared elsewhere
  }
  countBlock();
  if (latest.status === "pending")
    block(
      `Glass Box: the human is still reviewing your plan (they may take several minutes; that is normal). Call the glassbox get_contract tool again now with review_id ${id}, and keep calling it until status is approved or rejected. Don't stop, don't proceed and don't ask the human to paste anything until then.`,
    );
}

// The human answered since this session last looked and the agent hasn't seen the
// answer (no approved/rejected get_contract result in the transcript): tell it.
const sawAnswer = /\\?"status\\?":\s*\\?"(approved|rejected)/.test(transcript);
if (seenStatus(id) === "pending" && !sawAnswer && blocks < MAX_BLOCKS) {
  rememberStatus(id, latest.status);
  countBlock();
  if (latest.status === "approved")
    block(
      `${contractContext(latest, { justAnswered: true })}\nCall get_contract with review_id ${id} if you need the full contract, then tell the human exactly what you'll do under it.`,
    );
  block(
    `Glass Box: the human ${latest.status} your plan (review_id ${id}). Do not execute it. Tell the human in one line, and call align with a revised plan if they want you to continue.`,
  );
}
allow();
