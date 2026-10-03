import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import styles from "@/components/glassbox/glassbox.module.css";
import { Shell } from "@/components/glassbox/shell";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-navigation";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sign in · Glass Box",
  referrer: "no-referrer" as const,
};
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);
  return (
    <Shell minimal>
      <main className={styles.onboardShell}>
        <h1 className={`${styles.taskHeader} ${styles.pretty}`}>
          Your Glass Box account
        </h1>
        <p className={styles.agentName}>
          Sign in or create an account with your email. No password needed.
        </p>
        {params.error && (
          <p
            role="alert"
            className={styles.warnCard}
            style={{ marginBottom: 16 }}
          >
            That sign-in link couldn&apos;t be verified. Enter the code from
            your latest email below, or request a new email. Older links may
            have expired or already been used.
          </p>
        )}
        <div className={styles.onboardCard}>
          <SignInForm
            nextPath={next}
            allowExistingCode={Boolean(params.error)}
          />
        </div>
        <p style={{ textAlign: "center" }}>
          <Link href="/" className={styles.mutedLink}>
            Back to Glass Box
          </Link>
        </p>
      </main>
    </Shell>
  );
}
