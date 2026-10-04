#!/usr/bin/env node
// Connect a project's Claude Code to Glass Box: MCP server, binding-contract
// instructions, and the guardrail hooks.
//
//   node agent-kit/install.mjs <project-dir> --key gb_... [--url https://your-app.vercel.app]
//
// Without a repo checkout, download it from any Glass Box deployment; the hook
// files are then fetched from the same server:
//   curl -fsSL https://APP/api/agent-kit/install.mjs -o glassbox-install.mjs
//   node glassbox-install.mjs . --key gb_... --url https://APP
//
// --url defaults to $GLASSBOX_URL, then the hosted Glass Box below.
// Writes (all local to <project-dir>):
//   .mcp.json                         glassbox HTTP MCP server with the agent key
//   .claude/hooks/glassbox/*.mjs      context re-injection, PreToolUse guard, pop-up,
//                                     Stop hook (keeps the agent waiting for the human)
//   .claude/settings.local.json       hook wiring + GLASSBOX_URL / GLASSBOX_AGENT_KEY env
//   CLAUDE.md                         appends the "treat the contract as binding" section
// .mcp.json and settings.local.json contain the key: they are added to .gitignore.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://glass-box-app.vercel.app";
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dir = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : undefined;
const key = flag("--key") ?? process.env.GLASSBOX_AGENT_KEY;
const rawUrl = flag("--url") ?? process.env.GLASSBOX_URL ?? DEFAULT_URL;
let url;
try {
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  url = parsed.origin;
} catch {
  console.error(`--url must be an http(s) origin, got: ${rawUrl}`);
  process.exit(1);
}
if (!dir || !key?.startsWith("gb_")) {
  console.error(
    "Usage: node agent-kit/install.mjs <project-dir> --key gb_... [--url https://app.example.com]\n" +
      "Mint a key at <url>/connect. --url defaults to $GLASSBOX_URL, then " +
      DEFAULT_URL,
  );
  process.exit(1);
}

const kit = dirname(fileURLToPath(import.meta.url));
// Use the kit next to this script when run from a checkout; otherwise fetch the
// same files from the Glass Box server.
async function kitFile(relative) {
  const local = join(kit, relative);
  if (existsSync(local)) return readFileSync(local, "utf8");
  const name = relative.split("/").pop();
  const res = await fetch(`${url}/api/agent-kit/${name}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error(`Could not download ${name} from ${url} (${res.status}).`);
    process.exit(1);
  }
  return res.text();
}
// Load everything before writing anything, so a failed download changes nothing.
const HOOKS = [
  "glassbox-lib.mjs",
  "glassbox-context.mjs",
  "glassbox-guard.mjs",
  "glassbox-popup.mjs",
  "glassbox-stop.mjs",
];
const hookSources = await Promise.all(HOOKS.map((f) => kitFile(`hooks/${f}`)));
const section = await kitFile("CLAUDE.glassbox.md");
const readJson = (p) => {
  if (!existsSync(p)) return {};
  try {
    const value = JSON.parse(readFileSync(p, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {
    // reported below
  }
  console.error(`${p} is not a JSON object. Fix or move it, then rerun.`);
  process.exit(1);
};
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const mcpPath = join(dir, ".mcp.json");
const mcp = readJson(mcpPath);
const settingsPath = join(dir, ".claude/settings.local.json");
const settings = readJson(settingsPath);
mkdirSync(join(dir, ".claude/hooks/glassbox"), { recursive: true });

// 1. MCP server
mcp.mcpServers = {
  ...mcp.mcpServers,
  glassbox: {
    type: "http",
    url: `${url}/api/mcp/mcp`,
    headers: { Authorization: `Bearer ${key}` },
  },
};
writeJson(mcpPath, mcp);

// 2. Hooks
HOOKS.forEach((f, i) =>
  writeFileSync(join(dir, ".claude/hooks/glassbox", f), hookSources[i]),
);
const hook = (file, timeout) => ({
  type: "command",
  command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/glassbox/${file}"`,
  timeout,
});
// MCP_TOOL_TIMEOUT: the server answers within ~45s, but give slow networks headroom.
settings.env = {
  ...settings.env,
  GLASSBOX_URL: url,
  GLASSBOX_AGENT_KEY: key,
  MCP_TOOL_TIMEOUT: "120000",
};
// Pre-approve only the glassbox server from .mcp.json, not every server in it.
const enabled = Array.isArray(settings.enabledMcpjsonServers)
  ? settings.enabledMcpjsonServers
  : [];
settings.enabledMcpjsonServers = [
  ...enabled.filter((s) => s !== "glassbox"),
  "glassbox",
];
// Keep the human's own hooks; replace only entries from an earlier install.
const ours = {
  SessionStart: {
    matcher: "startup|resume|compact",
    hooks: [hook("glassbox-context.mjs", 10)],
  },
  UserPromptSubmit: { hooks: [hook("glassbox-context.mjs", 10)] },
  PreToolUse: {
    matcher: "Bash|WebFetch",
    hooks: [hook("glassbox-guard.mjs", 15)],
  },
  PostToolUse: {
    matcher: "mcp__glassbox__align|mcp__glassbox__answer_challenges",
    hooks: [hook("glassbox-popup.mjs", 10)],
  },
  // Blocks the agent from ending its turn while the human is still deciding.
  Stop: { hooks: [hook("glassbox-stop.mjs", 90)] },
};
const isOurHook = (hook) =>
  String(hook?.command ?? "").includes(".claude/hooks/glassbox/");
settings.hooks = { ...settings.hooks };
for (const [event, entry] of Object.entries(ours)) {
  const existing = Array.isArray(settings.hooks[event])
    ? settings.hooks[event]
    : [];
  const preserved = existing.flatMap((oldEntry) => {
    if (!Array.isArray(oldEntry?.hooks) || !oldEntry.hooks.some(isOurHook))
      return [oldEntry];
    const hooks = oldEntry.hooks.filter((oldHook) => !isOurHook(oldHook));
    return hooks.length ? [{ ...oldEntry, hooks }] : [];
  });
  settings.hooks[event] = [...preserved, entry];
}
writeJson(settingsPath, settings);

// 3. CLAUDE.md: add the Glass Box section, or replace an older copy of it in place
const mdPath = join(dir, "CLAUDE.md");
const md = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : "";
const start = md.indexOf("<!-- glassbox -->");
if (start === -1) {
  writeFileSync(
    mdPath,
    `${md}${md && !md.endsWith("\n") ? "\n" : ""}${md ? "\n" : ""}${section}`,
  );
} else {
  const endTag = "<!-- /glassbox -->";
  const end = md.indexOf(endTag, start);
  const after =
    end === -1 ? "" : md.slice(end + endTag.length).replace(/^\n/, "");
  writeFileSync(mdPath, `${md.slice(0, start)}${section}${after}`);
}

// 4. Keep the key out of git
const giPath = join(dir, ".gitignore");
const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
const missing = [".mcp.json", ".claude/settings.local.json"].filter(
  (l) => !gi.split("\n").includes(l),
);
if (missing.length)
  writeFileSync(
    giPath,
    `${gi}${gi && !gi.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`,
  );

console.log(`Glass Box connected in ${dir}
  MCP:   ${url}/api/mcp/mcp  (tools: align, get_contract, checkpoint, request_spend;
         prompt /mcp__glassbox__align)
  Hooks: SessionStart + UserPromptSubmit (contract re-injection), PreToolUse Bash|WebFetch (checkpoint guard),
         PostToolUse align (opens the pop-up window for the human),
         Stop (keeps the agent waiting until the human answers)
Start Claude Code in that directory and run /mcp to confirm "glassbox" is connected.`);
