#!/usr/bin/env node
// Connect a project's Claude Code to Glass Box: MCP server, binding-contract
// instructions, and the guardrail hooks.
//
//   node agent-kit/install.mjs <project-dir> --key gb_... [--url https://your-app.vercel.app]
//
// Writes (all local to <project-dir>):
//   .mcp.json                         glassbox HTTP MCP server with the agent key
//   .claude/hooks/glassbox/*.mjs      context re-injection + PreToolUse guard
//   .claude/settings.local.json       hook wiring + GLASSBOX_URL / GLASSBOX_AGENT_KEY env
//   CLAUDE.md                         appends the "treat the contract as binding" section
// .mcp.json and settings.local.json contain the key: they are added to .gitignore.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dir = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : undefined;
const key = flag("--key") ?? process.env.GLASSBOX_AGENT_KEY;
const url = (
  flag("--url") ??
  process.env.GLASSBOX_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
if (!dir || !key?.startsWith("gb_")) {
  console.error(
    "Usage: node agent-kit/install.mjs <project-dir> --key gb_... [--url https://app.example.com]",
  );
  process.exit(1);
}

const kit = dirname(fileURLToPath(import.meta.url));
const readJson = (p) =>
  existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
mkdirSync(join(dir, ".claude/hooks/glassbox"), { recursive: true });

// 1. MCP server
const mcpPath = join(dir, ".mcp.json");
const mcp = readJson(mcpPath);
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
for (const f of [
  "glassbox-lib.mjs",
  "glassbox-context.mjs",
  "glassbox-guard.mjs",
  "glassbox-popup.mjs",
]) {
  copyFileSync(join(kit, "hooks", f), join(dir, ".claude/hooks/glassbox", f));
}
const hook = (file, timeout) => ({
  type: "command",
  command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/glassbox/${file}"`,
  timeout,
});
const settingsPath = join(dir, ".claude/settings.local.json");
const settings = readJson(settingsPath);
// MCP_TOOL_TIMEOUT: the server answers within ~45s, but give slow networks headroom.
settings.env = {
  ...settings.env,
  GLASSBOX_URL: url,
  GLASSBOX_AGENT_KEY: key,
  MCP_TOOL_TIMEOUT: "120000",
};
settings.enableAllProjectMcpServers = true;
settings.hooks = {
  ...settings.hooks,
  SessionStart: [
    {
      matcher: "startup|resume|compact",
      hooks: [hook("glassbox-context.mjs", 10)],
    },
  ],
  UserPromptSubmit: [{ hooks: [hook("glassbox-context.mjs", 10)] }],
  PreToolUse: [
    { matcher: "Bash|WebFetch", hooks: [hook("glassbox-guard.mjs", 15)] },
  ],
  PostToolUse: [
    {
      matcher: "mcp__glassbox__align|mcp__glassbox__answer_challenges",
      hooks: [hook("glassbox-popup.mjs", 10)],
    },
  ],
};
writeJson(settingsPath, settings);

// 3. CLAUDE.md: add the Glass Box section, or replace an older copy of it in place
const mdPath = join(dir, "CLAUDE.md");
const md = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : "";
const section = readFileSync(join(kit, "CLAUDE.glassbox.md"), "utf8");
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
  MCP:   ${url}/api/mcp/mcp  (tools: align, get_contract, checkpoint, request_spend; prompt /mcp__glassbox__align)
  Hooks: SessionStart + UserPromptSubmit (contract re-injection), PreToolUse Bash|WebFetch (checkpoint guard),
         PostToolUse align (opens the pop-up window for the human)
Start Claude Code in that directory and run /mcp to confirm "glassbox" is connected.`);
