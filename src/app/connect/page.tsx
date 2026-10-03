import type { Metadata } from "next";
import { ErrorCard, SignInGate } from "@/components/sign-in-gate";
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
      <SignInGate
        nextPath="/connect"
        title="Connect your agent"
        body="Sign in with your email to mint an agent key. Claude Code, Cursor or any MCP client can then check its plan with you before it acts."
      />
    );

  // RLS: authenticated users can read only their own keys. Never select key_hash.
  const { data: keys, error } = await supabase
    .from("agent_keys")
    .select("id, name, created_at, last_used_at")
    .order("created_at", { ascending: false });
  if (error)
    return (
      <ErrorCard
        title="Could not load your agent keys"
        body="The database did not respond. Refresh to try again."
      />
    );

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-16">
      <h1 className="text-2xl font-black tracking-tight">Connect an agent</h1>
      <p className="mt-1 mb-6 text-ink-soft">
        Works with Claude Code, Codex, Cursor and any MCP client. One click, one
        command, and your agent checks its plan with you before it acts.
      </p>
      <ConnectClient origin={appUrl()} keys={keys ?? []} />
    </main>
  );
}
