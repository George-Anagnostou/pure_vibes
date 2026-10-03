import Link from "next/link";
import { redirect } from "next/navigation";
import { ResumeAfterSignIn, SignOutButton } from "@/components/session-actions";
import { SignInForm } from "@/components/sign-in-form";
import styles from "@/components/glassbox/glassbox.module.css";
import { Shell } from "@/components/glassbox/shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function currentEmail(): Promise<{
  email: string | null;
  failed: boolean;
}> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return { email: null, failed: true };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const failed = Boolean(error && error.name !== "AuthSessionMissingError");
    return { email: data.user?.email ?? null, failed };
  } catch {
    return { email: null, failed: true };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.billing === "success" || params.billing === "cancelled")
    redirect(`/account?billing=${params.billing}`);
  const { email, failed } = await currentEmail();

  return (
    <Shell minimal={!email}>
      <main className={styles.onboardShell}>
        <h1 className={`${styles.taskHeader} ${styles.pretty}`}>
          See how your AI <em>really</em> works
        </h1>
        <p className={styles.agentName}>
          Your agent shares its plan. You set the priorities. It follows them.
        </p>

        {params.auth === "error" && (
          <p
            role="alert"
            className={styles.alertCard}
            style={{ marginBottom: 16 }}
          >
            That sign-in link could not be verified. Request another and open it
            in this browser.
          </p>
        )}
        {failed && (
          <p
            role="alert"
            className={styles.alertCard}
            style={{ marginBottom: 16 }}
          >
            Can&apos;t reach the server right now. Refresh in a moment.
          </p>
        )}

        {email ? (
          <>
            <ResumeAfterSignIn />
            <div className={styles.sideSticky}>
              <div className={styles.submitBar} style={{ marginTop: 0 }}>
                <Link
                  href="/dashboard"
                  className={`${styles.submit} ${styles.submitLink}`}
                >
                  Open your dashboard
                </Link>
              </div>
              <Link
                href="/connect"
                className={`${styles.btnSecondary} ${styles.btnSecondaryLink}`}
              >
                Connect an agent
              </Link>
            </div>
            <p
              className={styles.agentName}
              style={{ marginTop: 20, marginBottom: 0 }}
            >
              Signed in as {email} · <SignOutButton />
            </p>
          </>
        ) : (
          <>
            <div className={styles.onboardCard}>
              <SignInForm nextPath="/dashboard" />
            </div>
            <p className={styles.agentName} style={{ marginBottom: 0 }}>
              New here? Sign in with your email, then connect your agent —
              Claude Code, Cursor or any MCP client.
            </p>
          </>
        )}
      </main>
    </Shell>
  );
}
