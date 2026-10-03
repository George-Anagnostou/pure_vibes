# Glass Box

Hackathon project in `George-Anagnostou/pure_vibes`.

## Team scaffold

Glass Box is built on this Next.js + TypeScript foundation for Vercel, Supabase, Stripe, and AI workflows. Start with:

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
