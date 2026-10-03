import type { Metadata } from "next";
import { readStrings } from "@/components/align-data";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import styles from "@/components/glassbox/glassbox.module.css";
import { Shell } from "@/components/glassbox/shell";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile · Glass Box" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <Shell>
        <SignInGate nextPath="/profile" title="Sign in to see your profile" />
      </Shell>
    );

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error)
    return (
      <Shell>
        <ErrorCard
          title="Could not load your profile"
          body="The database did not respond. Refresh to try again."
        />
      </Shell>
    );

  return (
    <Shell>
      <main className={styles.onboardShell}>
        <h1 className={`${styles.taskHeader} ${styles.pretty}`}>
          Next time, it already <em>knows</em>
        </h1>
        <p className={styles.agentName}>
          Your usual priorities, in order. Agents start from this.
        </p>
        <ProfileForm
          initialRanked={readStrings(profile?.ranked_priorities)}
          profile={
            profile
              ? {
                  dials: profile.dials,
                  hard_lines: profile.hard_lines,
                  budget_cents: profile.budget_cents,
                }
              : null
          }
        />
      </main>
    </Shell>
  );
}
