# Scaffold verification

Verified locally on Node 24.21.0:

- `npm run check`: ESLint, TypeScript, and 7 Vitest tests passed.
- `npm run build`: production Next.js build passed without cloud credentials.
- `npm run format:check` and `git diff --check`: passed.
- Production server: `/` returned HTTP 200 and `/api/health` returned `{"status":"ok"}`.
- `npm audit --omit=dev`: zero reported runtime dependency vulnerabilities at scaffold creation.

Not yet verified:

- Database migrations and 12 SQL security assertions: Docker/Podman is unavailable on the setup machine. The database CI job runs local Supabase and these assertions on an Ubuntu Docker runner.
- Live Supabase auth, OpenAI model calls, Stripe Checkout/portal/webhook delivery, and Vercel deployment: project credentials and team configuration are still needed. Use the acceptance checklist in `TEAM_SETUP.md`.

The full development dependency audit currently reports an upstream `braces` advisory through Next.js's ESLint tooling (five affected dependency nodes). The installed runtime dependencies are unaffected. Recheck upstream fixes during dependency updates; do not downgrade the Next.js ESLint config to an incompatible major solely to satisfy the automatic audit suggestion.
