# MCP authentication, allowances, and sandbox billing

Decision recorded 2026-10-03. George owns billing/auth infrastructure; Nick owns
MCP/review integration and all migrations; Kathryn owns the user interface.
This document specifies the remaining integration work. It is not a deployed
OAuth flow or an implemented usage ledger.

## Product contract

One monthly subscription per human user covers all of their connected agents.
The sandbox fixture is USD 10/month including 100 review checkpoints per Stripe
billing period. These are test values, not committed launch pricing. No automatic
overage charges, rollover, seat multiplication, or agent-authorized plan upgrades.

A billable unit is one new review successfully persisted and made available for
human review. In Nick's current MCP vocabulary, this is an `align` review (or a
future escalation that creates a distinct review), not every invocation of the
`checkpoint` tool. Reading, polling, approving/rejecting, and editing an existing
review are free. Failed creation and retries of the same operation are free.
Separate payload, rate, concurrency, and model-call limits still apply.

## Current implementation and sandbox state

- Canonical repo: `George-Anagnostou/pure_vibes`, production branch `master`.
- Supabase: `wfnplnspktwjywrfanrr`.
- Vercel: `prj_zA8rY48hSo4xvpoADL0ab2nX0zAu`, team
  `georgeanagnostous-projects`, current origin
  `https://pure-vibes-smoky.vercel.app`.
- Confirmed Stripe CLI sandbox: Glass Box, `acct_1T3hdjLWN3X7l2uW`.
- Created product: `prod_VNLeqR0R3n1crS`.
- Created monthly price: `price_1UMaxXLWN3X7l2uW2GcbZGkc`.
- Price lookup key: `glassbox_individual_monthly_100_sandbox_v1`.
- Price metadata: `included_checkpoints=100`, `overage_policy=blocked`,
  `plan_version=1`, `environment=sandbox`. Metadata describes the allowance;
  it does not enforce it.
- Reused portal: `bpc_1UMZTiLWN3X7l2uWWnAYDQkW`. Payment-method updates,
  invoice history, and cancellation at period end are enabled. Subscription
  updates are disabled. The portal headline now uses Glass Box.
- All created Stripe objects have `livemode=false`. No customers or subscriptions
  were created by this task, and the previous inactive plan remains unchanged.
- **Configuration blocker:** Vercel's inspected `STRIPE_SECRET_KEY` and
  `STRIPE_MCP_KEY` authenticate to a different test account,
  `acct_1UMYkzGzm67ldhmK` (`stripe-sandbox-cerulean-ferry`). Do not combine those
  credentials with the price above. The user must select the intended account;
  a persistent key from that account must be used. A short-lived CLI login is
  not a deployment credential.
- No webhook endpoint currently exists in the CLI's Glass Box sandbox. Create
  one after the account mismatch is resolved. Vercel price/key/webhook variables
  have not been changed by this task, and no deployment was triggered.

This branch adds `GET /api/billing/plan` (signed-in user, private/no-store) returning
`plan: {priceId, name, currency, unitAmount, interval, includedCheckpoints,
overagePolicy, version}` from the server-configured Stripe price. Amounts use
Stripe's minor currency units. Checkout validates that price is active, monthly,
licensed, and has a positive allowance with blocked overages before creating a
customer/session. The endpoint does not return a fabricated zero usage count.
No usage enforcement or visible usage widget is implemented on this branch.

## Connection and background UX

1. User adds the Glass Box MCP URL in a supported client. An unauthenticated
   protected endpoint returns a standards-compliant 401 challenge linking to
   protected-resource metadata and the authorization server.
2. The client starts authorization-code OAuth with PKCE. A browser opens the
   Glass Box login/signup and consent flow. Show the requesting client's identity
   and access being granted; a connected agent cannot approve its own access.
3. Persist an opaque onboarding attempt bound to the signed-in user and OAuth
   authorization request. If no eligible subscription exists, offer the monthly
   sandbox Checkout. Store return context server-side, never trust an arbitrary
   redirect URL supplied by a client.
4. After Checkout, wait for verified billing synchronization. A success query
   parameter is not entitlement. Resume the authorization request; if it expired
   during login/payment, restart authorization rather than issuing a stale code.
5. The client exchanges the code and stores credentials using its own secure
   storage. Refresh occurs in the background. Browser login cookies are not MCP
   bearer tokens. Website and MCP access resolve to the same Supabase user.
6. Each new billable operation checks current subscription and quota on the
   server. Existing reviews remain readable/completable at the allowance limit
   or after cancellation; starting a new review requires entitlement. Identity
   revocation still denies all access.
7. Show subscription status, used/total allowance, remaining units, in-flight
   reservations, renewal time, and Manage billing in the account UI. Expose a
   read-only `get_usage` MCP tool using the same backing query. Do not prompt on
   every call. Prompt only for initial connection/payment, human review, expired
   authorization, payment failure, or exhausted allowance.

“Background” applies to authentication, token refresh, billing sync, and usage
accounting. It does not auto-approve interpretations or remove human checkpoints.
An MCP server cannot force every host to open a browser or resume an agent turn;
verify the target client's actual behavior. Start with real Claude Code and Codex
connection tests. Grok web and Gemini web compatibility is not yet verified.

Nick's draft PR #5 currently supports manually issued `gb_` agent keys and a
`/connect` page. That is a fallback, not automatic OAuth onboarding. Prefer bearer
headers; do not put long-lived keys in query strings. Keep key migration/revocation
explicit while OAuth is added. PR #4 is now merged; coordinate with the remaining #5 onboarding work.

## Supabase authentication requirements

Use the existing Supabase users. Enable/configure the Supabase OAuth 2.1 server
and a consent path such as `/oauth/consent` once the application route is ready.
The feature is currently documented as beta; validate the selected clients before
committing to compatibility. Configure the stable Site URL, app login callbacks,
and each OAuth client's registered redirect URI. The login callback and MCP
client redirect are different destinations.

Use asymmetric signing keys/JWKS and validate token signature, issuer, expiration,
intended audience/resource, subject, and authorized client. Check actual Supabase
resource/audience behavior against the negotiated MCP version before release.
MCP discovery must advertise the real public MCP endpoint; Vercel deployment
protection must not redirect clients/webhooks to Vercel login.

Use Supabase-managed authorization grants and refresh rotation. Do not build
custom token tables or store raw access/refresh tokens in application tables.
Store app-level connection permissions separately; verify which custom scopes
Supabase supports rather than assuming arbitrary MCP scope strings are issued.
OAuth permissions and RLS must prevent agents from invoking human approval,
billing-management, or connection-administration operations directly. A browser
session alone and an agent token are not equivalent authorization contexts.

Preserve server-side OAuth state across login and Checkout; verify state/PKCE,
exact redirect registrations, expiry, and ownership. Support disconnect/revoke
and check connection revocation on requests, since a previously issued JWT may
otherwise remain valid until expiry. Configure SMTP for outside testers; test
magic-link delivery and browser continuity separately from OAuth itself.

References:

- [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [OAuth token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization)

## Schema proposal for Nick

The hosted database already has `profiles`, `agent_keys`, `reviews`, `contracts`,
`events`, and `spends`, plus scaffold billing tables. Do not create competing
versions of those entities. Hosted migration history currently extends through
`20261003250000_review_challenges`. PR #4 merged those migrations during this
task; confirm local/remote history again before the next push. Nick owns
migration creation/deployment and generated
types. This task performs no schema writes.

| Table                      | Required additions or fields                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_connections`          | UUID, user FK, OAuth client/grant reference, display name, app permissions, created/last-used/revoked timestamps. No raw credentials. Client display names are untrusted labels.                                                  |
| `onboarding_attempts`      | UUID, user FK, authorization request reference, expected client, checkout session ID, expiry, completion timestamp. Private server-owned state; verify the signed-in user before resuming.                                        |
| `sessions`                 | UUID, owner user FK, connection FK, external session reference, title, status, timestamps. External session references are namespaced by connection, never authority.                                                             |
| `reviews`                  | Add session reference and operation/idempotency key. Preserve Nick's existing review/contract fields.                                                                                                                             |
| `interpretation_revisions` | Review FK, monotonically increasing version, parent revision, source (agent/human), structured interpretation JSON, schema version, timestamp. Immutable snapshots.                                                               |
| `review_decisions`         | Review/revision FK, verified human user, approve/request-changes/reject decision, optional comment, timestamp. Approval binds an exact revision.                                                                                  |
| `tool_calls`               | User, connection, session, tool, request ID, logical operation key, status, error code, start/end times. Capture minimal telemetry, not full transcripts by default.                                                              |
| `subscriptions`            | Retain Stripe ID and user ownership; add current period start, plan version/allowance snapshot, quantity, and reconciliation timestamps. Keep period end/cancel flag. Reject unsupported multi-item or quantity >1 plans for MVP. |
| `usage_periods`            | UUID, user, subscription ID, period start/end, allowance snapshot, reserved and consumed counters; unique (subscription, period start). Use Stripe's billing boundaries, not calendar-month arithmetic.                           |
| `usage_reservations`       | UUID, user, period FK, operation key, request digest, review FK, state, lease expiry, timestamps; unique (user, operation key). Persist the original outcome for retry recovery.                                                  |
| `usage_events`             | Append-only UUID, user, period, reservation/review, event type, quantity, timestamp, unique dedupe key. Server-written; adjustments are explicit entries.                                                                         |
| `model_runs`               | Session/review, provider/model, status, token usage, start/end times, sanitized error code and provider request reference. Separate cost telemetry from billed checkpoints.                                                       |

Keep `billing_customers` as the unique user-to-Stripe-customer mapping and
`stripe_events` as the private verified-event deduplication ledger. Do not store
card numbers/payment credentials. Nick's `spends` table and `request_spend` tool
represent agent spending approvals; they are not the Glass Box subscription or
checkpoint allowance and must not charge it implicitly.

Enable RLS on every exposed table. Owners may read permitted rows; billing and
usage writes are server-owned. OAuth client tokens must not inherit the browser's
human-decision privileges. Enforce same-owner/same-session relationships with
composite constraints or transactional validation, not only application filters.
Index user/time and session/time lookups; bound telemetry retention and define
account deletion separately from financial/audit retention.

### Atomic usage operations

Nick should expose server-only transactional functions; final names/types should
be agreed in his shared contract before the MCP hooks are wired:

- `reserve_checkpoint`: verify persisted entitlement, expected price/quantity and
  unexpired billing period; lock the user's current period; deduplicate the
  logical operation; reject a reused key with different input; enforce
  consumed + reserved < allowance; create one reservation. Return a stable result
  for retries. Neither the request body nor the client sets user identity or quota.
- `complete_checkpoint`: within the transaction that publishes the review, move
  one reserved unit to consumed and append one usage event. Repeated completion
  is a no-op returning the original review. A rejected interpretation is still
  one delivered review, not a refunded/new checkpoint.
- `release_checkpoint`: release failed reservations idempotently. Reconcile
  crashed/stale workers with a lease/fencing check; a worker cannot publish after
  its reservation is released. Unknown outcomes must be reconciled before retry.
- `get_usage`: owner-scoped read returning period boundaries, allowance, consumed,
  reserved, remaining, subscription status, and cancellation state. Never label
  missing/unavailable metering as zero usage. MCP and web UI use the same result.

Deduplication survives connection retries, process restarts, and billing renewal.
A retry after renewal returns its original result without consuming the new
period. Existing operations finish against their reserved period. Renewals create
one period using the new Stripe interval, without resetting historical rows.
Use verified webhook reconciliation for eligibility; unknown prices or missing
periods fail closed for new reviews. Stripe customer subscription updates must
include period boundaries and plan snapshot in the same database transaction.
Keep a reconciliation path for missed/out-of-order webhooks.

## Remaining sandbox rollout

1. Resolve the Stripe account mismatch. Put a persistent sandbox API key into
   Vercel `STRIPE_SECRET_KEY`; align tool credentials and publishable keys too.
   If the Vercel sandbox is chosen instead, create/reuse its own product/price
   and update this inventory. Never reuse IDs across accounts.
2. Create the hosted `/api/stripe/webhook` destination in that account, subscribed
   to `customer.subscription.created`, `.updated`, and `.deleted`. Use the pinned
   SDK's API version (`2026-09-30.endive` at this review). Store its signing secret
   as Vercel Production `STRIPE_WEBHOOK_SECRET`, and its price ID as
   `STRIPE_PRICE_ID`. Local CLI listeners have their own secrets.
3. Deploy after matching configuration is saved and the PR checks pass. A Vercel
   Production deployment can use Stripe sandbox credentials; it is not live money.
4. Nick implements/tests the usage schema and hooks new review creation. George
   extends webhook persistence for billing period/plan snapshots. Kathryn binds
   the plan and usage endpoints into account UI. Do not enable a paid allowance
   promise before usage enforcement and display work together.
5. Complete a real sandbox Checkout as a signed-in test user; verify webhook 200,
   customer ownership, subscription row, and allowance initialization. Replay
   the event; reconnect a second client; ensure no second subscription/allotment.
6. Test concurrent last-unit requests, operation retries, failure release, renewal,
   cancellation at period end, payment failure, and account/connection revocation.
   Quota exhaustion must preserve access to existing reviews and billing portal.
7. Test OAuth login/signup/consent/payment/resume on each supported client; confirm
   refresh works without repeat prompts and another user's sessions stay private.

Test outcome records should distinguish configuration verified, unit-tested,
locally exercised, and live sandbox end-to-end verified. No live payment or
customer account-deletion flow is authorized by this sandbox task.
