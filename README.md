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

Sign in at `<origin>/connect` (email magic link), mint an agent key (`gb_...`, shown once), and paste one of these. `<origin>` is the deployed app, e.g. `https://glassbox.cards`; the `/connect` page fills in the origin and key for you.

**Claude Code**

```bash
claude mcp add --transport http glassbox <origin>/api/mcp/mcp --header "Authorization: Bearer gb_YOUR_KEY"
```

**Claude Code + auto pop-up hooks (agent kit)**: no repo checkout needed.

```bash
curl -fsSL <origin>/api/agent-kit/install.mjs -o glassbox-install.mjs
node glassbox-install.mjs . --key gb_YOUR_KEY --url <origin>
```

`--url` defaults to `$GLASSBOX_URL`, then the hosted app. The pop-up hook opens a Chrome app window on macOS, the default browser elsewhere, and over SSH/headless (or with `GLASSBOX_POPUP=off`) tells the agent to show you the link instead.

**Cursor** (`.cursor/mcp.json`) and **any MCP client** (streamable HTTP):

```json
{
  "mcpServers": {
    "glassbox": {
      "type": "http",
      "url": "<origin>/api/mcp/mcp",
      "headers": { "Authorization": "Bearer gb_YOUR_KEY" }
    }
  }
}
```

Clients that cannot set headers can use `<origin>/api/mcp/mcp?key=gb_YOUR_KEY`. That works, but URLs end up in logs and history, so prefer the header. CORS is open for browser clients such as MCP Inspector; requests without a valid key get `401` with a `WWW-Authenticate: Bearer` challenge.

**REST API**: `POST <origin>/api/review` (same fields as the `align` tool) returns `review_id` + `align_url`; poll `GET <origin>/api/reviews/<review_id>/contract`. Both take `Authorization: Bearer gb_...`.

Check an endpoint end to end (health, 401, CORS, tools/prompts, `get_contract` error):

```bash
node scripts/mcp-client-check.mts --url <origin> --key gb_YOUR_KEY
# or create and delete a throwaway user + key (needs Supabase admin env):
node --env-file=.env.local scripts/mcp-client-check.mts --url <origin> --throwaway
```
