# Team setup

This is the shared foundation for George (`George-Anagnostou`), Kathryn (`kathryn-salad-studio`), and Nick (`ncentis`) building GlassBox. The integration foundation is implemented; the product's transparent agent-visualization experience is still in development. Use **one shared development project per service**, with each teammate using their own login. Keep real production data and payments separate when you launch.

## 1. Accounts and access

Existing subscriptions do not automatically grant API usage, project access, or team seats. Confirm each service's current plan permits the collaboration you need.

| Service        | Owner setup                                                                 | Invite teammates / verify                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub         | Canonical repository is `George-Anagnostou/pure_vibes`; default is `master` | Grant Kathryn and Nick Write access; have them accept their invitations. `master` requires PRs, one approval, and `app`/`database` checks; force-push and deletion are disabled. |
| Supabase       | Use `pure_vibes` (`wfnplnspktwjywrfanrr`, `us-east-2`)                      | Invite Kathryn and Nick to the organization/project with development access. Confirm they can open Auth, SQL, and logs.                                                          |
| Stripe         | Select a shared sandbox or test-mode account                                | Invite each teammate with a developer-appropriate role and sandbox access. Confirm who can create products and webhook destinations.                                             |
| Vercel         | Import this GitHub repository into the intended team                        | Invite both teammates with project/deployment access; connect their GitHub identities. Check team-seat/deploy-author requirements on your plan.                                  |
| OpenAI         | Create/select an API project, enable billing, choose usage limits           | Invite teammates to the project and create individual development keys. ChatGPT subscriptions do **not** include OpenAI API credit.                                              |
| Secret manager | Create a shared development vault                                           | Share project configuration through 1Password, Bitwarden, or your existing vault. Keep personal keys personal.                                                                   |

File ownership and approvals are defined in the **Team ownership and product contract** section of `AGENTS.md`. GitHub Issues are available for coordination; check related open issues and PRs before starting overlapping work.

## 2. Configure Supabase

### Recommended for the hackathon: shared hosted development project

Only Nick creates migrations and applies them to the shared hosted development database. Other teammates propose schema changes to Nick and can test migrations locally after coordinating with him:

```bash
npm ci
npx supabase login
npx supabase projects list
npx supabase link --project-ref PURE_VIBES_PROJECT_REF
npx supabase migration list --linked
# Nick only, after explicit approval for the shared database change:
npx supabase db push --dry-run
npm run db:push
npm run db:types -- --linked
```

The verified hosted project is `pure_vibes` (`wfnplnspktwjywrfanrr`, `us-east-2`). Confirm the organization and dashboard if selecting a different project; a name alone is not enough. The repository's Supabase Preview integration also targets this project. `supabase link` configures only the local checkout and does not connect GitHub or deploy migrations. Confirm the linked target again before any push. Commit migrations and regenerated `src/types/database.ts` together. Each teammate links independently; CLI login/link state is local and ignored. CLI authentication is separate from app keys. Never edit a migration already pushed to the shared project; add a new migration.

In Supabase **Project Settings → API / API Keys** (or the Connect dialog), copy:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Secret key → `SUPABASE_SECRET_KEY` (legacy `service_role` also works)

In **Authentication → URL Configuration**:

- Set Site URL to your stable deployed development URL once available.
- Allow `http://localhost:3000/auth/callback`.
- Allow `https://YOUR-APP.vercel.app/auth/callback`.
- Add exact additional development origins as needed; keep them aligned with `APP_URL`.

Enable the Email provider and keep its default magic-link email template. The scaffold uses the PKCE code callback; open the link in the **same browser** that requested it. Different browsers, stripped links, and mail scanners can invalidate the flow.

Supabase's default hosted email service restricts recipients and has low rate limits. Verify all three team addresses are allowed for development, or configure custom SMTP in Supabase Auth before testing with outside users. Auth signup is enabled by default; disable new signups after registering the team if this is a private demo.

### Optional: fully local Supabase

Install and start Docker Desktop or a compatible Docker engine, then:

```bash
npm run db:start
npx supabase status
npm run db:test
npm run db:types
```

Use the local URL and API keys from `supabase status` in `.env.local` (local anon key goes in the publishable-key variable; local service-role key goes in the secret-key variable). Studio is at `http://127.0.0.1:54323`; local email inbox is at `http://127.0.0.1:54324`. `db:start` applies migrations on initial creation. For an existing disposable local database, `npm run db:reset` rebuilds it from migrations and **deletes local data**.

Local and hosted user IDs differ. Switching databases while sharing a Stripe sandbox leaves previous customer mappings behind; use the corresponding database and test environment together.

## 3. Configure Stripe test subscriptions

1. Select the intended **sandbox / test mode**.
2. Create a Product and a **recurring Price**. Choose the amount and currency as a team; the scaffold does not assume either.
3. Set `STRIPE_PRICE_ID=price_...` and the matching `STRIPE_SECRET_KEY=sk_test_...`.
4. Enable/configure the **Customer portal** in the same environment. Allow the cancellation/update behavior you want to demo.
5. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), authenticate with `stripe login`, and run:

```bash
npm run stripe:listen
```

6. Copy the printed `whsec_...` into your own `.env.local` as `STRIPE_WEBHOOK_SECRET`; restart Next.js. Each teammate uses the secret printed by their own listener. A CLI listener secret differs from the deployed endpoint's secret.

For a deployed app, add an HTTPS webhook destination at:

```text
https://YOUR-APP.vercel.app/api/stripe/webhook
```

Subscribe to:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Set that destination's signing secret in **Vercel**, not the local listener secret. Use the API version matching the installed Stripe SDK when possible; this handler retrieves current subscription state using the SDK's pinned version. Stripe must be able to reach the route without Vercel login/deployment protection. Use a stable development deployment and test delivery in Stripe Workbench.

Checkout uses the server-configured price; it never accepts a client-supplied amount or customer ID. Return from Checkout alone does not grant access: the webhook updates Supabase first. For an end-to-end test, complete actual test Checkout with `4242 4242 4242 4242`, a future expiry, and any valid CVC. Generic `stripe trigger` fixtures have no matching app customer and are intentionally ignored for billing ownership.

## 4. Configure AI

- Put your project API key into `OPENAI_API_KEY`.
- `AI_MODEL=gpt-4.1-mini` is the initial default; choose another model with structured-output support if needed and verify access in your provider project.
- Set project usage budgets/alerts in the provider dashboard.
- Leave `AI_REQUIRE_SUBSCRIPTION=false` while integrating. Set it to `true` to require an `active` or `trialing` subscription for `STRIPE_PRICE_ID` before running AI.
- To use another AI provider, change the model factory in `src/lib/ai/workflow.ts`, install that provider's AI SDK adapter, and update `.env.example` and `scripts/check-env.mjs`.

The sample performs two sequential model calls. It has token caps, a 45-second AI timeout, and a database-enforced 10-attempts/hour/user quota. Provider retries can incur additional usage; this is not a global dollar spending cap. It does not require a Vercel AI Gateway account: model calls go directly to OpenAI.

## 5. Set up each teammate's laptop

Prerequisites: Git, Node 24 LTS, npm. Docker is needed only for local Supabase/testing; Stripe CLI is needed for local payment webhooks.

```bash
gh repo clone George-Anagnostou/pure_vibes
cd pure_vibes
git fetch origin --prune
OWNER=george # choose nick, george, or kathryn
TASK=my-task
git worktree add "../pure_vibes-$OWNER-$TASK" -b "$OWNER/$TASK" origin/master
cd "../pure_vibes-$OWNER-$TASK"
nvm install
nvm use
npm ci
npm run setup
```

Fill `.env.local` from `.env.example` using your shared vault and your personal AI key. Then:

```bash
npm run env:check
npm run check
npm run dev
```

Open `http://localhost:3000`. If you run a different port, update `APP_URL` and Supabase's allowed callback URL. Restart after env changes. Only the two `NEXT_PUBLIC_SUPABASE_*` values belong in browser code. All other credentials stay server-side.

## 6. Deploy on Vercel

1. Import the repository; framework **Next.js**, root directory **repository root**, Node **24.x**. Standard build command: `npm run build`; no custom output directory required.
2. Add `.env.example`'s variables in Project Settings → Environment Variables. Vercel does not read your local `.env.local` file.
3. Set `APP_URL=https://YOUR-STABLE-APP.vercel.app` with no path. Configure the same Supabase callback origin and Stripe webhook destination.
4. Keep Stripe test keys, test price, and the hosted webhook secret together. Keep the Supabase URL, publishable key, and secret key from the same project.
5. Redeploy after setting/changing variables. Public Supabase values are bundled at build time.
6. Verify `/api/health`, email sign-in, workflow history, Checkout, and the portal.

**Preview deployments:** the scaffold requires an explicit trusted `APP_URL` for callbacks, payment redirects, and same-origin POST checks. An arbitrary generated preview URL will not match a production `APP_URL`. Use a stable preview branch/domain with its own env overrides and allowlisted callback, or use previews for build/UI review and run integrations on the stable development deployment. Do not copy production keys into every preview.

For a real launch, create separate production resources/keys, set Production env values, add a production webhook, choose the live recurring price, and configure Auth/SMTP for that domain. Never use real card details in test mode.

## 7. Team workflow and hackathon cadence

- Use a dedicated worktree and owner-prefixed branch per task (`nick/...`, `george/...`, `kathryn/...`); keep the shared base checkout clean. Fetch `origin` and check related issues/PRs before starting. Never push directly to `master`.
- Open focused PRs frequently. Cross-owner changes must disclose touched files and receive the affected owner's approval. `master` requires one independent approval plus the `app` and `database` checks; stale approvals are dismissed and force-push/deletion are disabled.
- Before updating a PR, fetch and rebase your clean task branch on current `origin/master`, then rerun checks. Resolve conflicts only in your own files; stop and ask the owner when conflicts touch their files. Coordinate before rewriting a branch another contributor uses.
- Keep `package-lock.json` committed; teammates and CI use `npm ci`.
- Only Nick creates migrations and pushes to shared Supabase. Test locally, regenerate types, and commit migration/types together. Obtain explicit approval before shared DB changes.
- Do not make untracked schema edits in the shared SQL editor. If necessary, immediately capture them as a migration.
- Vercel Git integration deploys application code; it does **not** apply Supabase migrations. Apply backward-compatible migrations before deploying code that needs them.
- Service invitations are developer access. Signing into this app creates a separate customer/user account; the current app does not yet implement shared customer workspaces.
- On hackathon day (date to confirm), target a ~5:00pm PT finish: 4:00pm PT feature freeze (only demo-blocking fixes afterward), and 4:30pm PT freeze on `master` (nothing merges after).

## End-to-end acceptance checklist

- [ ] Each teammate can clone, run checks, view the intended service projects, and deploy as permitted.
- [ ] Sign-in email opens the app in the same browser and identifies the correct user.
- [ ] Run a brief; reload history and confirm the completed output persists.
- [ ] Sign in as another user and confirm the first user's history is not visible.
- [ ] Start a test subscription; confirm Stripe webhook returns 200 and the subscription appears in Supabase.
- [ ] Resend the same webhook event; no duplicate subscription or side effect appears.
- [ ] Open the portal; cancel at period end; confirm `cancel_at_period_end` updates. Access remains active until Stripe ends the subscription.
- [ ] With subscription gating on, unpaid users receive 402 and active subscribers can run AI.
- [ ] Test the deployed callback and webhook, not just localhost.

## Information still needed from the team

No secret values need to be sent in chat. Decide/share:

1. Intended Supabase project ref, Vercel team/project, and Stripe sandbox/account.
2. Preferred AI provider and whether API billing is enabled.
3. Stable development URL (a Vercel domain is sufficient).
4. Recurring plan amount/currency/interval and desired portal behavior.
5. Individual accounts vs shared customer workspaces for the eventual product.

Enter credentials in your local env file, Vercel, and shared vault. Those steps activate the scaffold without committing secrets.
