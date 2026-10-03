import type { Metadata } from "next";
import { readStrings } from "@/components/align-data";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile · Glass Box" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <SignInGate nextPath="/profile" title="Sign in to see your profile" />
    );

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error)
    return (
      <ErrorCard
        title="Could not load your profile"
        body="The database did not respond. Refresh to try again."
      />
    );

  return (
    <main className="mx-auto max-w-lg px-4 pt-6 pb-16">
      <h1 className="text-2xl font-black tracking-tight">
        Next time, it already knows.
      </h1>
      <p className="mt-1 text-ink-soft">
        Your usual priorities, in order. Agents start from this.
      </p>
      <div className="mt-6">
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
      </div>
    </main>
  );
}
