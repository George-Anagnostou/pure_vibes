# Shared development services

- Website: https://glass-box-app.vercel.app
- Vercel: `georgeanagnostous-projects/pure-vibes`, GitHub production branch `master`.
- Supabase: `pure_vibes`, ref `wfnplnspktwjywrfanrr`. Nick owns shared migrations.
- Stripe: Vercel resource `stripe-sandbox-cerulean-ferry`, account `acct_1UMYkzGzm67ldhmK` (**sandbox only**).
- Test subscription: **$10 USD/month**, price `price_1UMZlFGzm67ldhmKBbRJP3u0`.
- Webhook: `/api/stripe/webhook`; subscription created/updated/deleted events. Portal cancellation is at period end.
- OpenAI configuration is deferred. The product MCP endpoint is not implemented yet.

## Each teammate

After accepting the service invitations, create your task worktree and run `npm ci` / `npm run setup`. Then:

```bash
npx vercel@latest login
npx vercel@latest link --project pure-vibes --scope georgeanagnostous-projects
npx vercel@latest env pull .env.vercel.development.local --environment=development --scope georgeanagnostous-projects
```

Merge the downloaded development values into your private `.env.local`; Next.js does not load `.env.vercel.development.local` automatically. Keep `APP_URL=http://localhost:3000`. Never commit or paste either file. Production secret exports contain `[SENSITIVE]` placeholders, not usable keys.

Use `npm run stripe -- <command>` for this project's Stripe CLI requests. It loads the project key instead of relying on an unrelated global Stripe login. Run `npm run stripe:listen` and copy its signing secret into local `STRIPE_WEBHOOK_SECRET`; the hosted webhook uses a different secret.

The Stripe resource is connected to Development, Preview, and Production, but remains a sandbox in all three. Use the stable website for hosted auth/payment testing; generated previews need their own matching `APP_URL` and Supabase configuration.

## Verification

Hosted checks passed for authenticated Checkout, the customer portal, a paid sandbox subscription, signed webhook synchronization into Supabase, duplicate delivery, and unsigned-request rejection. Temporary test users, subscriptions, and customers were cleaned up. OpenAI and browser email-link delivery remain separate checks.
