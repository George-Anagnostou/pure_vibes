# Architecture

## GlassBox team boundaries

This project makes AI agent work legible so people can understand, guide, and align with it. It is maintained in the canonical repository, `George-Anagnostou/pure_vibes`. Read `AGENTS.md` before editing. Nick owns product direction, GlassBox agent reasoning/checkpoints/contracts, review and MCP API routes, scripts, fixtures, and Supabase migrations. Kathryn owns UI and public assets. George owns infrastructure/backend integrations, auth, Stripe, CI, deployment configuration, and internal documentation. `src/lib/glassbox/types.ts` is Nick-owned shared UI/API contract; ask him before changing it. After 3:00pm PT on hackathon day, contract changes must be additive. Cross-owner PRs must disclose touched areas and obtain the affected owner's approval before merge.

Only Nick creates migrations and applies them to the shared Supabase project. Never edit an already-pushed migration; create a new one. Get explicit approval before shared or destructive database actions. Vercel deployment does not apply Supabase migrations.

## Integration map

```text
Browser → Next.js page / API routes (Vercel Node runtime)
          ├─ Supabase Auth: cookie session → verified user
          ├─ Supabase Postgres: user-scoped reads under RLS
          ├─ AI SDK → OpenAI: normalize brief → structured plan
          │            └─ privileged, authorized run persistence
          └─ Stripe: Checkout / customer portal
Stripe → signed webhook → current subscription lookup → transactional DB sync
```

The current interface is an initial GlassBox prototype with human review, an inbox, and agent connection flows; it is not the finished product experience. Environment-dependent clients initialize only when used, so CI builds succeed without secrets.

## Routes

| Route                        | Purpose                                               | Access                                                        |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/health`            | App liveness only, no provider probe                  | Public                                                        |
| `POST /api/auth/sign-in`     | `{ "email": "..." }` → magic link                     | Same origin; Supabase Auth limits                             |
| `GET /auth/callback`         | Exchange PKCE code for session                        | Valid auth code                                               |
| `POST /api/auth/sign-out`    | Sign out this browser                                 | Same origin                                                   |
| `GET /api/workflows`         | Latest 20 runs for this user                          | Verified user + RLS                                           |
| `POST /api/workflows`        | `{ "brief": "..." }` → saved structured plan          | Same origin + verified user + quota (+ optional subscription) |
| `POST /api/billing/checkout` | Redirect URL for server-configured subscription price | Same origin + verified user                                   |
| `POST /api/billing/portal`   | Redirect URL for this user's Stripe customer          | Same origin + verified user                                   |
| `POST /api/stripe/webhook`   | Sync subscription lifecycle                           | Raw-body Stripe signature                                     |

JSON API mutations expect the exact `APP_URL` origin. For manual curl requests, include `Origin: http://localhost:3000` plus a valid session cookie; curl does not create authentication for you. Browser controls call these routes directly.

## Database boundaries

- `workflow_runs`: input, output, model, status, timestamps, and successful call token totals. Authenticated users can read only their own rows; writes are server-owned.
- `billing_customers`: one app user ↔ one Stripe customer; server-created before Checkout. No ownership inferred from email or untrusted request metadata.
- `subscriptions`: one row per Stripe subscription, allowing multiple historical canceled subscriptions without losing current state.
- `stripe_events`: private deduplication ledger; insert and subscription update share one transaction.
- `reserve_workflow`: service-only RPC using a per-user advisory lock to enforce the hourly quota across serverless instances.
- `sync_subscription`: service-only RPC; older event timestamps cannot overwrite newer ones.

Supabase's privileged client bypasses RLS. Keep it in server-only modules and derive user IDs from verified authentication, never from JSON bodies. End-user clients have no INSERT/UPDATE/DELETE grants on these tables or execute grants on privileged functions. SQL tests cover isolation, write restrictions, quota, duplicate events, and stale events.

## Auth and caching

`src/proxy.ts` refreshes Supabase sessions and forwards updated cookies/cache headers. API routes verify users with `getUser()`. Private API responses use `Cache-Control: private, no-store`; the home page is dynamic. No user-specific response is statically cached. Webhooks bypass the auth proxy.

## AI extension point

Edit `src/lib/ai/workflow.ts`. The included workflow is deliberately generic:

1. Normalize the supplied brief using a bounded text call.
2. Generate and validate an action plan using a Zod schema.
3. Persist the completed output and aggregate successful-call token counts.

This is **request-time orchestration**, not durable background execution. The route waits for completion; jobs do not resume after a process kill. An interrupted invocation can leave a `running` row, and a provider failure may incur usage without complete token accounting. The UI makes missing results visible. Move long-running jobs to a durable queue/workflow service (for example Vercel Workflow, Inngest, or Trigger.dev) with per-step idempotency and job reconciliation when the product requires it. Do not launch unawaited promises in a Vercel function.

Prompts are stored in the database and sent to the configured AI provider. Define product-specific retention and deletion behavior before collecting sensitive customer inputs. No AI tool can spend money, execute shell commands, or mutate customer data in this example.

## Billing semantics and limits

The sample supports one recurring price and assumes one subscription item. Checkout guards existing subscriptions, reuses open sessions, and uses a 30-minute-bucket idempotency key for duplicate requests. This reduces accidental double-clicks, but is not a distributed exactly-one-subscription guarantee around time-bucket boundaries or external Stripe changes. Add a database-backed checkout lock and reconciliation if the product needs that guarantee.

Webhooks retrieve the latest Stripe subscription and apply event timestamp ordering plus deduplication. Stripe timestamps have second precision; concurrent deliveries and external edits can still require reconciliation. This is an eventually consistent local billing view. Before launching payment-critical entitlements, add a scheduled Stripe-to-database reconciliation job. Missing/unmapped customers are ignored because other apps can share an account. Persistence failures return 500 for Stripe retries.

Optional AI entitlement accepts only `active` / `trialing` rows for the configured price. It does not treat the Checkout success query string as evidence of payment. `past_due`, `unpaid`, and canceled subscriptions do not grant access; cancel-at-period-end remains active until Stripe changes status. Choose grace-period policy as a product decision.

Deleting an Auth user cascades local app records but does not cancel their Stripe subscription. A future account-deletion flow must coordinate cancellation/customer cleanup before deleting the user. There is no account-deletion endpoint in this scaffold.

## Configuration and verification

- `.env.example` documents values; `npm run setup` copies without overwriting local work.
- `npm run env:check` checks presence and URL syntax, not connectivity or permission.
- `npm run check` runs lint, strict TypeScript, and unit tests without external credentials.
- `npm run db:test` requires local Supabase + Docker. GitHub Actions supplies the Docker runner.
- `npm run build` verifies Next.js production compilation without contacting providers.
- Follow `TEAM_SETUP.md` for live acceptance tests; mocked tests cannot prove account permissions or webhook delivery.

The scaffold was built with no cloud credentials. No projects, subscriptions, products, invitations, or deployments were created automatically.
