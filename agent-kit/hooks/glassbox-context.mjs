#!/usr/bin/env node
// SessionStart / UserPromptSubmit hook: re-inject the current Glass Box priority
// contract into the agent's context every turn, so long tasks don't forget it.
import { contractContext, latestContract, readStdin } from "./glassbox-lib.mjs";

const input = await readStdin();
let latest = null;
try {
  latest = await latestContract();
} catch {
  process.exit(0); // Never block the human's prompt because Glass Box is unreachable.
}
if (!latest) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name ?? "UserPromptSubmit",
      additionalContext: contractContext(latest),
    },
  }),
);
