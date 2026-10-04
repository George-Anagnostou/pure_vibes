#!/usr/bin/env node
// SessionStart / UserPromptSubmit hook: re-inject the current Glass Box priority
// contract into the agent's context every turn, so long tasks don't forget it.
import {
  contractContext,
  latestContract,
  readStdin,
  rememberStatus,
  seenStatus,
} from "./glassbox-lib.mjs";

const input = await readStdin();
let latest = null;
try {
  latest = await latestContract();
} catch {
  process.exit(0); // Never block the human's prompt because Glass Box is unreachable.
}
if (!latest) process.exit(0);
// "The human has answered": the review was pending the last time a hook looked.
const justAnswered =
  latest.status === "approved" && seenStatus(latest.review_id) === "pending";
rememberStatus(latest.review_id, latest.status);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name ?? "UserPromptSubmit",
      additionalContext: contractContext(latest, { justAnswered }),
    },
  }),
);
