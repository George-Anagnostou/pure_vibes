#!/usr/bin/env node
// PostToolUse hook for mcp__glassbox__align: pop the align page open for the human
// as a small app-style window, so they can re-rank while the agent waits on get_contract.
// macOS + Chrome: chromeless --app window resized to phone-ish proportions on the right.
// Other desktops: the default browser (open / start / wslview / xdg-open).
// Over SSH, on a headless box, or with GLASSBOX_POPUP=off: open nothing and tell the
// agent to show the human the link instead. Never fails the tool call.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readStdin, rememberStatus } from "./glassbox-lib.mjs";

const WIDTH = 480;
const HEIGHT = 820;

const input = await readStdin();
const raw = JSON.stringify(input.tool_response ?? input.tool_result ?? "");
const url = raw.match(/https?:\/\/[^"\s\\]+\/align\/[0-9a-f-]{36}/)?.[0];
if (!url) process.exit(0); // e.g. align errored, or the contract came straight back
// Lets the Stop / context hooks say "the human has answered" when it flips.
rememberStatus(url.split("/align/")[1], "pending");

// A missing opener (no xdg-open, no Chrome) must not crash the hook.
const detached = (cmd, args) => {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    // ignore: the agent is told to show the link either way
  }
};

const env = process.env;
const remote = Boolean(env.SSH_CONNECTION || env.SSH_TTY);
const headlessLinux =
  process.platform === "linux" &&
  !env.WSL_DISTRO_NAME &&
  !env.DISPLAY &&
  !env.WAYLAND_DISPLAY;
const disabled = /^(0|off|false|no)$/i.test(env.GLASSBOX_POPUP ?? "");
const canOpen = !disabled && !remote && !headlessLinux;

if (!canOpen) {
  // fall through to the message below
} else if (
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
} else if (env.WSL_DISTRO_NAME) {
  detached("wslview", [url]);
} else {
  detached("xdg-open", [url]);
}

const additionalContext = canOpen
  ? `Glass Box opened a pop-up for the human at ${url}. Also show them that link in one line in case no window appeared. Call get_contract now and keep calling it until status is approved or rejected; the human may take several minutes, so don't stop or proceed before that.`
  : `Glass Box could not open a window on this machine. Show the human this link now so they can review your plan: ${url} . Then call get_contract and keep calling it until status is approved or rejected; the human may take several minutes, so don't stop or proceed before that.`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
  }),
);
