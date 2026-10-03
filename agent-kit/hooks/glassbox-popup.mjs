#!/usr/bin/env node
// PostToolUse hook for mcp__glassbox__align: pop the align page open for the human
// as a small app-style window, so they can re-rank while the agent waits on get_contract.
// macOS + Chrome: chromeless --app window resized to phone-ish proportions on the right.
// Anything else: the default browser.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readStdin } from "./glassbox-lib.mjs";

const WIDTH = 480;
const HEIGHT = 820;

const input = await readStdin();
const raw = JSON.stringify(input.tool_response ?? input.tool_result ?? "");
const url = raw.match(/https?:\/\/[^"\s\\]+\/align\/[0-9a-f-]{36}/)?.[0];
if (!url) process.exit(0); // e.g. align errored, or the contract came straight back

const detached = (cmd, args) =>
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();

if (
  process.platform === "darwin" &&
  existsSync("/Applications/Google Chrome.app")
) {
  detached("open", ["-na", "Google Chrome", "--args", `--app=${url}`]);
  // A running Chrome ignores --window-size, so place the window once it exists.
  const script = `
    tell application "Finder" to set {_l, _t, screenW, screenH} to bounds of window of desktop
    set x to screenW - ${WIDTH} - 24
    repeat 40 times
      tell application "Google Chrome"
        repeat with w in windows
          if URL of active tab of w starts with "${url}" then
            set bounds of w to {x, 60, x + ${WIDTH}, 60 + ${HEIGHT}}
            set index of w to 1
            return
          end if
        end repeat
      end tell
      delay 0.25
    end repeat`;
  detached("osascript", ["-e", script]);
} else if (process.platform === "darwin") {
  detached("open", [url]);
} else if (process.platform === "win32") {
  detached("cmd", ["/c", "start", "", url]);
} else {
  detached("xdg-open", [url]);
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `Glass Box opened a pop-up for the human at ${url}. Call get_contract now and keep calling it until they submit; don't proceed before that.`,
    },
  }),
);
