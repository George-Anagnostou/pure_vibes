# GlassBox

**See how your AI _really_ works.**

GlassBox is the opposite of a black box: it makes AI agent work visible and understandable, helping people inspect and guide agents for better human-agent alignment. The canonical repository is `George-Anagnostou/pure_vibes`.

## Current product prototype

This repository contains a Next.js + TypeScript GlassBox prototype built on Vercel, Supabase, Stripe, and AI workflows. Its align, inbox, and agent flows demonstrate the product direction; the complete visualization experience and launch-ready workflows are still in development. Start with:

```bash
nvm use
npm ci
npm run setup
# Fill in .env.local, then:
npm run dev
```

See [AGENTS.md](AGENTS.md) for worktree-based team/agent setup, integrations, and PR workflow; [docs/TEAM_SETUP.md](docs/TEAM_SETUP.md) for service configuration; and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for integration boundaries.

The canonical remote is `https://github.com/George-Anagnostou/pure_vibes`; do not push or open PRs against `ncentis/pure_vibes`.

Run `npm run check`, `npm run format:check`, and `npm run build` before opening a PR. Local database tests require Docker (`npm run db:start`, then `npm run db:test`).

## Connect an agent to Glass Box

1. Sign in at **https://glass-box-app.vercel.app/connect** (email sign-in link or code).
2. Click **Create my key**. Your agent key (`gb_…`) is shown once and filled into every command on that page.
3. Paste the command for your client. These are the same commands `/connect` shows; replace `gb_…` with your key.

The MCP endpoint is `https://glass-box-app.vercel.app/api/mcp/mcp` (streamable HTTP, `Authorization: Bearer gb_…`).

**Claude Code** (added for every project):

```bash
claude mcp add --transport http --scope user glassbox https://glass-box-app.vercel.app/api/mcp/mcp --header "Authorization: Bearer gb_…"
```

Restart Claude Code and type `/mcp`; `glassbox` should say connected.

**Codex**: save the key, then add the server.

```bash
echo 'export GLASSBOX_API_KEY=gb_…' >> ~/.zshrc && export GLASSBOX_API_KEY=gb_…
codex mcp add glassbox --url https://glass-box-app.vercel.app/api/mcp/mcp --bearer-token-env-var GLASSBOX_API_KEY
```

Open Codex in a new terminal and run `/mcp`. On bash, use `~/.bashrc`.

**Claude Desktop** (Settings → Developer → Edit Config, `claude_desktop_config.json`; needs Node.js):

```json
{
  "mcpServers": {
    "glassbox": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://glass-box-app.vercel.app/api/mcp/mcp",
        "--header",
        "Authorization: Bearer gb_…"
      ]
    }
  }
}
```

Quit and reopen Claude Desktop.

**Cursor** (`.cursor/mcp.json` or Settings → MCP) and most other MCP clients:

```json
{
  "mcpServers": {
    "glassbox": {
      "url": "https://glass-box-app.vercel.app/api/mcp/mcp",
      "headers": { "Authorization": "Bearer gb_…" }
    }
  }
}
```

Clients that only take a URL can use `https://glass-box-app.vercel.app/api/mcp/mcp?key=gb_…`. The key ends up in logs and history that way, so prefer the header. Requests without a valid key get `401` with a `WWW-Authenticate: Bearer` challenge.

**Optional: pop-up window for Claude Code.** On `/connect`, open "Optional: pop-up window for Claude Code" to get a one-time install command (it works once and expires after a few minutes), then run it in your project folder:

```bash
curl -fsSL https://glass-box-app.vercel.app/i/<CODE> | sh
```

It installs the agent kit: the MCP server, hooks that open the Glass Box pop-up whenever Claude Code checks in (Chrome app window on macOS, default browser elsewhere; over SSH/headless or with `GLASSBOX_POPUP=off` the agent shows you the link instead), and project instructions to check in before acting. Restart Claude Code in that folder and type `/mcp`.

**REST API**: the same three steps as the MCP tools (`align` → `answer_challenges` → `get_contract`). Every call takes `Authorization: Bearer gb_…`.

1. `POST /api/review` with `task`, `understanding`, `plan` (the approach; the MCP `align` tool calls this field `approach`), `priorities` (`[{name, how?}]`, highest first) and `decisions` (`[{topic, question, choice, thinks_you_want?, why?, alternatives?}]`). If Glass Box has challenges, it returns `status: "answer_challenges"` with `challenges: [{id, scenario, trade_off}]`; otherwise `status: "pending"` and `align_url`.
2. **Required when challenges come back:** `POST /api/reviews/<review_id>/answers` with `{"answers": [{"id": "c1", "response": "…", "favors": "<one side of trade_off>", "would_ask_human": true}]}`, one per challenge. The human's pop-up only opens after this; it returns `align_url`.
3. Show the human `align_url`, then poll `GET /api/reviews/<review_id>/contract` until `status` is `approved` (or `rejected`).

```bash
curl -X POST https://glass-box-app.vercel.app/api/review \
  -H "Authorization: Bearer gb_…" -H "Content-Type: application/json" \
  -d '{"task": "…", "understanding": "…", "plan": "…", "priorities": [{"name": "Accuracy"}], "decisions": [{"topic": "Source", "question": "Which data source?", "choice": "Official API"}]}'

curl -X POST https://glass-box-app.vercel.app/api/reviews/REVIEW_ID/answers \
  -H "Authorization: Bearer gb_…" -H "Content-Type: application/json" \
  -d '{"answers": [{"id": "c1", "response": "…", "favors": "Accuracy", "would_ask_human": true}]}'

curl https://glass-box-app.vercel.app/api/reviews/REVIEW_ID/contract \
  -H "Authorization: Bearer gb_…"
```

The app address is moving to `https://glass-box-app.vercel.app`; until that switch is complete, `https://pure-vibes-smoky.vercel.app` also works in every command above.

Check an endpoint end to end (health, 401, CORS, tools/prompts, `get_contract` error):

```bash
node scripts/mcp-client-check.mts --url <origin> --key gb_YOUR_KEY
# or create and delete a throwaway user + key (needs Supabase admin env):
node --env-file=.env.local scripts/mcp-client-check.mts --url <origin> --throwaway
```
