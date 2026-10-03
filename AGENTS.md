# Working on Pure Vibes

This runbook is for George, Katie, Nick, and their coding agents. Run commands from the repository root unless stated otherwise. Read `README.md` for the team's current product ideas, `docs/TEAM_SETUP.md` for account configuration, and `docs/ARCHITECTURE.md` for integration boundaries before changing integrations.

## Repository and session orientation

- Canonical repository: **`George-Anagnostou/pure_vibes`** — https://github.com/George-Anagnostou/pure_vibes.
- The upstream default branch is currently **`master`**, not `main`. "Main repo" means the canonical repository, not a branch named `main`. Discover the default before starting work in case it changes.
- Inspect `git status --short`, `git remote -v`, and `git branch --show-current` first. Preserve existing teammate changes; stage only files belonging to your task.
- **All repo editing happens in a dedicated Git worktree.** Never edit files in the shared base checkout. Create one worktree per person/task on its own branch before making changes; this keeps simultaneous edits isolated. Push that branch and open its PR from the worktree. Coordinate task/file ownership if branches touch overlapping areas.
- **Keep work synchronized.** At the start of a task and at least once each work session, fetch/prune remote branches and check open issues and PRs for related work. Before editing, start from the latest default branch. During active collaboration, check for merged work frequently (at least daily and before substantial dependent changes); before opening/updating a PR, fetch and rebase your own branch onto the latest default branch, resolve conflicts in your worktree, rerun checks, and push. Keep changes small and PRs focused so teammates can review/merge promptly. Never rebase or force-push a branch another person is using; coordinate first.
- Read this file at the start of each agent session. If your coding tool does not automatically load `AGENTS.md`, explicitly ask it to read it. A tool authenticated on one teammate's machine is not automatically available to another teammate or agent.

## Install tools and dependencies

| Tool                           | When needed                                          | Installation / invocation                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git                            | Required to clone, branch, commit, and push          | Install from https://git-scm.com/downloads; verify `git --version`.                                                                                                                      |
| Node.js **24.x** + npm         | Required for the application and checks              | Use `.nvmrc` with `nvm install` / `nvm use`, or install Node 24 from https://nodejs.org. Verify `node --version` and `npm --version`.                                                    |
| GitHub CLI (`gh`)              | Recommended for repo access, PRs, and CI inspection  | Install from https://cli.github.com; run `gh auth login`, `gh auth setup-git`, then `gh auth status`.                                                                                    |
| Project packages               | Required                                             | `npm ci` installs the locked Next.js, React, TypeScript, Supabase SDK/CLI, Stripe SDK, AI SDK/OpenAI adapter, Zod, ESLint, Prettier, and Vitest versions. Do not install those globally. |
| Docker Desktop / Docker engine | Only for local Supabase and database tests           | Install from https://docs.docker.com/get-started/get-docker/ and start the engine. Verify `docker info`. Hosted Supabase development does not require Docker.                            |
| Supabase CLI                   | Database migrations, local services, generated types | Already installed by `npm ci`; invoke `npx supabase ...` or the `npm run db:*` scripts. Use the repository version.                                                                      |
| Stripe CLI                     | Forwarding test webhooks to your laptop              | Install from https://docs.stripe.com/stripe-cli; run `stripe login`. The npm Stripe SDK does not install this CLI.                                                                       |
| Vercel CLI                     | Optional linking, env management, manual previews    | Invoke `npx vercel@latest ...`; the CLI is not a project dependency. Git-connected deployments can be managed entirely in Vercel.                                                        |
| Coding-agent client            | Your preferred development assistant                 | Install and authenticate your chosen client separately. The application itself does not require an agent client or MCP server.                                                           |

On macOS with Homebrew, Git/GitHub/Stripe tools can be installed with:

```bash
brew install git gh stripe/stripe-cli/stripe
# Optional, for local database work:
brew install --cask docker
```

For nvm installation, follow https://github.com/nvm-sh/nvm#installing-and-updating. On Windows, use Node 24 directly or your version manager's equivalent; the shell examples below assume Bash/Zsh (or WSL).

## First-time teammate setup

1. Ask the project owner for GitHub repository access and invitations to the intended Supabase organization/project, Stripe sandbox, Vercel team/project, AI API project, and shared secret vault. Use your own service logins.
2. Authenticate GitHub, then clone the canonical repository once as a shared **base checkout** (keep it clean; do not edit files here):

   ```bash
   gh auth login
   gh auth setup-git
   gh repo clone George-Anagnostou/pure_vibes
   cd pure_vibes
   git fetch origin
   BASE_BRANCH=$(gh repo view George-Anagnostou/pure_vibes --json defaultBranchRef --jq '.defaultBranchRef.name')
   TASK="onboarding-$USER"
   git worktree add "../pure_vibes-$TASK" -b "docs/$TASK" "origin/$BASE_BRANCH"
   cd "../pure_vibes-$TASK"
   nvm install
   nvm use
   npm ci
   npm run setup
   ```

   If the base repo is already cloned, reuse it and create a uniquely named worktree beside it; do not clone inside another checkout. The example uses a username-based task name; change it if it is already in use. If using Node 24 directly, skip the nvm commands. Install dependencies and create `.env.local` separately in each worktree as needed (`node_modules` and env files are not shared).

3. Populate `.env.local` from the team vault and your own development credentials. `npm run setup` copies `.env.example` without overwriting an existing file. Never print or paste the env file into agent output.
4. Run `npm run env:check`, `npm run check`, then `npm run dev`. Open `http://localhost:3000`. The starter page and code checks work without cloud keys; live integration actions require configuration.
5. Complete the relevant integration setup below and the acceptance checklist in `docs/TEAM_SETUP.md`.

### Environment ownership

| Variables                                                          | Where to obtain / configure                                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                          | `http://localhost:3000` locally; the exact stable app origin in Vercel. Also allow its `/auth/callback` URL in Supabase Auth. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Connect / API settings for the same project. These are the only browser-exposed configuration values.                |
| `SUPABASE_SECRET_KEY`                                              | That project's server secret key (or local legacy service-role key).                                                          |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`                             | Matching Stripe test account/sandbox secret key and recurring price.                                                          |
| `STRIPE_WEBHOOK_SECRET`                                            | Your own CLI listener's `whsec_...` locally; the hosted destination's signing secret in Vercel.                               |
| `OPENAI_API_KEY`, `AI_MODEL`                                       | AI API project key and accessible structured-output model. ChatGPT subscriptions do not include API usage.                    |
| `AI_REQUIRE_SUBSCRIPTION`                                          | `false` for initial integration; `true` to require a synced active/trialing subscription for the configured price.            |

App environment variables, CLI logins, and agent/MCP authentication are separate. `supabase login`, `stripe login`, and Vercel login do not populate `.env.local`. Restart Next.js after env changes; redeploy Vercel after hosted env changes.

## Invoke project tools

Use the terminal/shell tool exposed by your agent client for the same commands a teammate would run. Prefer existing package scripts over ad hoc scripts or installing duplicate dependencies.

| Task                                                 | Command                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Start application                                    | `npm run dev`                                                                   |
| Check env presence and URL syntax (not connectivity) | `npm run env:check`                                                             |
| Lint, typecheck, unit tests                          | `npm run check`                                                                 |
| Individual checks                                    | `npm run lint`, `npm run typecheck`, `npm test`                                 |
| Format / verify formatting                           | `npm run format` / `npm run format:check`                                       |
| Production build / serve it                          | `npm run build` / `npm start`                                                   |
| App liveness                                         | `curl --fail http://localhost:3000/api/health`                                  |
| CLI usage discovery                                  | `npx supabase --help`, `stripe --help`, `gh --help`, `npx vercel@latest --help` |

`dev`, `db:start`, and `stripe:listen` serve different purposes. Keep the app and webhook listener running in separate terminals or your agent's supported background-process facility. Inspect an existing server before starting another on the same port. Stop only processes started for your task.

### Supabase: auth, schema, and data

For the **shared hosted development project**, authenticate and link this checkout:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Get the project ref from the owner/dashboard; do not infer it from an unrelated accessible project. Coordinate migration deployment with the teammate who owns the shared database:

```bash
npx supabase migration new descriptive_name
# Edit the new SQL migration; test on local Supabase when available.
npx supabase db push --dry-run
npm run db:push
npm run db:types -- --linked
```

For **local Supabase**, start Docker, then:

```bash
npm run db:start
npx supabase status
npm run db:test
npm run db:types
npm run db:stop
```

`supabase status` can display local API credentials; use them locally without copying its raw output into a PR or chat. Local Studio is `http://127.0.0.1:54323`; the test email inbox is `http://127.0.0.1:54324`. `npm run db:reset` deletes and rebuilds the **local** database; use it only when local data is disposable. Commit migrations and regenerated `src/types/database.ts` together.

Use `src/lib/supabase/client.ts` in browser components, `server.ts` for session-scoped server access, and `admin.ts` only for authorized privileged writes. Enable Email auth and configure callback URLs/SMTP as described in the team guide. Test sign-in links in the same browser that requested them.

### Stripe: subscriptions and webhooks

```bash
stripe login
npm run stripe:listen
```

Set the printed signing secret locally and restart the app. Configure the recurring test price and customer portal in the same sandbox. Use the starter page's subscription and billing buttons to exercise `src/app/api/billing/*`.

The hosted destination is `/api/stripe/webhook`, subscribed to `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Use its separate secret on Vercel. Multiple teammates can run listeners; duplicate events are handled by the event ledger. Test Checkout with card `4242 4242 4242 4242`, a future expiry, and a valid test CVC. Generic `stripe trigger` customers are not mapped to app users, so those fixtures alone do not prove billing synchronization.

### AI: model calls and workflows

The app uses `ai` + `@ai-sdk/openai`, not a separate OpenAI CLI. Configure API billing and `OPENAI_API_KEY`, then sign in and run a brief through the starter page. Implementation: `src/lib/ai/workflow.ts`; authenticated execution/history: `src/app/api/workflows/route.ts`.

The example normalizes a brief, generates a Zod-validated plan, and saves it in Supabase. It permits 10 attempts/user/hour and has request/token limits. Changing providers requires updating the model adapter, dependency, env example/checker, and docs. A coding-agent subscription or its MCP connection does not automatically supply the app's model API key.

### Vercel: link and deploy

Git integration is the usual deployment path: import the canonical repo into the team's Vercel project, add hosted env values, and configure the production branch to match the actual upstream default. For CLI work:

```bash
npx vercel@latest login
npx vercel@latest link
# Choose the EXISTING team/project when prompted.
npx vercel@latest whoami
npx vercel@latest env ls
npx vercel@latest deploy
```

The last command creates a preview deployment. `npx vercel@latest deploy --prod` targets production; use it for an intended release. `.vercel/` is local link state and must stay ignored. `npx vercel@latest env pull .env.vercel.local --environment=development` optionally downloads development env into an ignored file without replacing `.env.local`; merge deliberately because local origins and webhook secrets differ. Next.js will not automatically load `.env.vercel.local`.

Preview API calls require a matching `APP_URL` and Supabase redirect allowlist. Use a stable configured integration domain for auth/billing testing. Vercel code deployment does not apply Supabase migrations. Confirm Stripe can reach the hosted webhook without deployment-login protection.

### Optional agent tools / MCP integrations

- Each teammate configures supported GitHub, Supabase, Stripe, Vercel, or documentation connectors in their own agent client. This repository does not currently ship shared MCP server configuration.
- Discover the tools/resources actually exposed by your client, read their schemas/help, and invoke the advertised tool name with the verified repository, project, team, and sandbox identifiers. Do not invent tool names or assume another teammate's connectors are installed.
- Use the client's tool invocation interface for MCP tools; MCP names are not shell commands. Use the terminal tool for the documented CLIs. If a connector is missing, the CLI/dashboard paths above remain the supported fallback.
- Complete interactive OAuth/device login in the teammate's own session. Keep tokens in the client's credential store or local environment, not committed configuration.
- Supabase is this app's database. An available connector for another database/provider is not a substitute for the team's Supabase project.
- Report missing executables, account access, or project configuration precisely. Continue credential-free code checks where possible, and label cloud actions that have not been tested.

## Branches, commits, and PRs to the canonical repo

With write access, `origin` should point to `George-Anagnostou/pure_vibes`. Keep the base checkout clean. Discover the default, then create a **separate worktree and task branch** before editing:

```bash
gh auth status
git remote -v
gh issue list --repo George-Anagnostou/pure_vibes --state open
gh pr list --repo George-Anagnostou/pure_vibes --state open
git fetch origin --prune
BASE_BRANCH=$(gh repo view George-Anagnostou/pure_vibes --json defaultBranchRef --jq '.defaultBranchRef.name')
git worktree add ../pure_vibes-feat-short-description -b feat/short-description "origin/$BASE_BRANCH"
cd ../pure_vibes-feat-short-description
npm ci
npm run setup
```

Replace `feat/short-description` and the worktree path with meaningful unique names; use `fix/` or `docs/` when appropriate. One task/branch/worktree per person or agent. Do not reuse another teammate's worktree or edit the base checkout. Keep `.env.local` private in each worktree. Do not push task work directly to the default branch.

Before pulling or rebasing, make sure your worktree is clean (`git status --short`). Commit or safely stash your own work first; never overwrite another person's edits. To refresh a task branch after others merge:

```bash
git fetch origin --prune
git rebase "origin/$BASE_BRANCH"
# Resolve conflicts only in your own worktree, then rerun checks.
```

Use `git pull --rebase` only when the task branch has the correct upstream configured and the worktree is clean. Do not routinely merge the default branch into a task branch (it creates noisy history). If the branch has already been shared with other contributors, coordinate before rebasing because rebasing changes its commit IDs.

Before submitting:

```bash
npm run check
npm run format:check
npm run build
# For database changes, with local Supabase running:
npm run db:test
git diff --check
git diff
git status --short
git add path/to/changed-file path/to/another-changed-file
git diff --cached
git commit -m "Describe the change"
git push -u origin feat/short-description
gh pr create --repo George-Anagnostou/pure_vibes \
  --base "$BASE_BRANCH" --head feat/short-description \
  --title "Describe the change" \
  --body "Summary: ...
Verification: ...
Setup or migrations: ..."
```

Replace the staging paths and PR text with your actual files/results. Recompute `BASE_BRANCH` if using a new shell. Include the purpose, tests run/skipped, required env names (never values), migration/deployment steps, and screenshots for visible UI changes. Use `--draft` on `gh pr create` for unfinished work. Add `--reviewer GITHUB_LOGIN` when you know the teammate's GitHub username.

Without write access, request access or use a **fork**. Clone your fork, keep `origin` pointing to it, and configure `upstream` to `https://github.com/George-Anagnostou/pure_vibes.git` if absent. Fetch `upstream` and branch from `upstream/$BASE_BRANCH`; push to your fork's `origin`. Open the PR against the canonical repository using:

```bash
gh pr create --repo George-Anagnostou/pure_vibes \
  --base "$BASE_BRANCH" --head YOUR_GITHUB_LOGIN:feat/short-description \
  --title "Describe the change" --body "Summary and verification: ..."
```

Inspect review and CI results with:

```bash
gh pr view PR_NUMBER --repo George-Anagnostou/pure_vibes --web
gh pr checks PR_NUMBER --repo George-Anagnostou/pure_vibes
gh run list --repo George-Anagnostou/pure_vibes --branch feat/short-description
gh run view RUN_ID --repo George-Anagnostou/pure_vibes --log-failed
```

Replace `PR_NUMBER` / `RUN_ID` with actual IDs. Push follow-up commits to the same branch to update the PR. Both `app` and `database` CI jobs should pass before merging; teammate review and the repository's branch rules govern merging. Share the PR URL in your final handoff. If asked only to prepare code, report that it has not been pushed or submitted.

After the PR is merged (or the task is abandoned), first stop any dev server/processes started from that worktree, then from the base checkout remove only your own worktree and branch after confirming it is clean and no longer needed:

```bash
git worktree list
git -C ../pure_vibes-feat-short-description status --short
git worktree remove ../pure_vibes-feat-short-description
git branch -d feat/short-description
git worktree prune
```

Do not force-remove a worktree or delete a branch with uncommitted/unmerged work. Preserve it or ask its owner first. Keep the canonical base checkout for creating the next isolated worktree.

## Implementation rules

- Use Node 24 and npm. Commit `package-lock.json`; install with `npm ci`.
- Keep integration credentials in `.env.local` / Vercel, never source, logs, or chat. Add new variable names and descriptions to `.env.example` and the environment checker.
- Use the session-scoped Supabase client for user reads. Privileged writes require verified authentication or a verified Stripe webhook. Never accept user/customer IDs as authority from request bodies.
- Add schema changes as new migrations. Preserve RLS, regenerate database types, and run SQL tests locally when Docker is available.
- Keep payment amounts and price selection server-controlled. Billing access comes from synced Stripe state, not a redirect query parameter.
- Keep AI workflows bounded and awaited. Do not describe request-time orchestration as a durable job system.
- Run `npm run check`, `npm run format:check`, and `npm run build`. For schema changes, also run `npm run db:test` with local Supabase.
- State which external integrations were actually tested. A successful build or mocked test does not verify live accounts.
- Preserve the team's product decisions; the action-plan workflow and individual accounts are replaceable scaffold defaults.
