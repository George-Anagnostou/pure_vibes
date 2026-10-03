import { createClient } from "@/lib/supabase/server";
import { StarterConsole } from "@/components/starter-console";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  let email: string | null = null;
  let billing = "No subscription synced yet.";
  let connectionError = false;
  if (configured) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error && error.name !== "AuthSessionMissingError")
        connectionError = true;
      email = data.user?.email ?? null;
      if (data.user) {
        const { data: subscriptions, error: dbError } = await supabase
          .from("subscriptions")
          .select("status")
          .order("updated_at", { ascending: false })
          .limit(5);
        if (dbError) connectionError = true;
        else if (subscriptions.length)
          billing = subscriptions.map((s) => s.status).join(", ");
      }
    } catch {
      connectionError = true;
    }
  }
  return (
    <main>
      <h1>Pure Vibes</h1>
      <p className="muted">
        Your team’s integration starter. Sign in, test an AI workflow, and
        connect billing. Build your product from here.
      </p>
      {!configured && (
        <div className="notice">
          <strong>Start with your environment.</strong>
          <p>
            Run <code>npm run setup</code>, fill in <code>.env.local</code>, and
            restart the dev server. Follow <code>docs/TEAM_SETUP.md</code> to
            connect the team’s accounts.
          </p>
        </div>
      )}
      {connectionError && (
        <p className="notice error" role="alert">
          Supabase could not load your session or database. Check the project
          keys and apply the migration in <code>supabase/migrations</code>.
        </p>
      )}
      {params.auth === "error" && (
        <p className="notice error" role="alert">
          That sign-in link could not be verified. Request another link and open
          it in the same browser.
        </p>
      )}
      {params.billing === "success" && (
        <p className="notice" role="status">
          You returned from Checkout. Billing access is confirmed by the
          webhook; refresh shortly to see the synced status.
        </p>
      )}
      {params.billing === "cancelled" && (
        <p className="notice">
          Checkout was cancelled. You can try again below.
        </p>
      )}
      <StarterConsole configured={configured} email={email} billing={billing} />
      <section>
        <h2>Team handoff</h2>
        <p>
          Setup and invitations: <code>docs/TEAM_SETUP.md</code>
          <br />
          Integration boundaries: <code>docs/ARCHITECTURE.md</code>
        </p>
        <p>
          <a href="/api/health">Check app health</a>
        </p>
      </section>
    </main>
  );
}
