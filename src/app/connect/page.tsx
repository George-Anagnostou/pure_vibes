import type { Metadata } from "next";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
import styles from "@/components/glassbox/glassbox.module.css";
import { Shell } from "@/components/glassbox/shell";
import { appUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ConnectClient } from "./connect-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect an agent · Glass Box" };

export default async function ConnectPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return (
      <Shell>
        <SignInGate
          nextPath="/connect"
          title="Connect your agent"
          body="Sign in with your email to mint an agent key. Claude Code, Cursor or any MCP client can then check its plan with you before it acts."
        />
      </Shell>
    );

  // RLS: authenticated users can read only their own keys. Never select key_hash.
  const { data: keys, error } = await supabase
    .from("agent_keys")
    .select("id, name, created_at, last_used_at")
    .order("created_at", { ascending: false });
  if (error)
    return (
      <Shell>
        <ErrorCard
          title="Could not load your agent keys"
          body="The database did not respond. Refresh to try again."
        />
      </Shell>
    );

  return (
    <Shell>
      <main className={styles.onboardShell} style={{ maxWidth: 620 }}>
        <h1 className={`${styles.taskHeader} ${styles.pretty}`}>
          Connect your agent
        </h1>
        <p className={styles.agentName}>
          Mint a key, paste one snippet into your agent, and it shows you its
          plan before it acts.
        </p>
        <ConnectClient origin={appUrl()} keys={keys ?? []} />
      </main>
    </Shell>
  );
}
