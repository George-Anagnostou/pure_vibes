# pure_vibes

Supabase 2026 Hackathon

## Team scaffold

Next.js + TypeScript starter integrating Vercel, Supabase, Stripe, and OpenAI. Start with:

```bash
nvm use
npm ci
npm run setup
# Fill in .env.local, then:
npm run dev
```

See [AGENTS.md](AGENTS.md) for worktree-based team/agent setup, integrations, and PR workflow; [docs/TEAM_SETUP.md](docs/TEAM_SETUP.md) for service configuration; and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for integration boundaries.

Run `npm run check`, `npm run format:check`, and `npm run build` before opening a PR. Local database tests require Docker (`npm run db:start`, then `npm run db:test`).
