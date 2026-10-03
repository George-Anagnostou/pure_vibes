"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentSetup } from "@/components/connect-agent";

export type AgentKeySummary = {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "never";

export function ConnectClient({
  origin,
  keys,
}: {
  origin: string;
  keys: AgentKeySummary[];
}) {
  const router = useRouter();
  return (
    <>
      <AgentSetup origin={origin} onMinted={() => router.refresh()} />
      <KeyList keys={keys} />
    </>
  );
}

function KeyList({ keys }: { keys: AgentKeySummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function revoke(key: AgentKeySummary) {
    if (!confirm(`Revoke “${key.name}”? Agents using it stop working.`)) return;
    setBusy(key.id);
    setError("");
    const res = await fetch(`/api/agent-keys/${key.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else setError("Could not revoke that key. Try again.");
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-5">
      <h2 className="text-lg font-black">Your agent keys</h2>
      {keys.length === 0 ? (
        <p className="mt-1 text-sm text-ink-soft">No keys yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{k.name}</p>
                <p className="text-xs text-ink-soft" suppressHydrationWarning>
                  Created {when(k.created_at)} · Last used{" "}
                  {when(k.last_used_at)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === k.id}
                onClick={() => revoke(k)}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-stop hover:border-stop disabled:opacity-60"
              >
                {busy === k.id ? "Revoking…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-stop">
          {error}
        </p>
      )}
    </section>
  );
}
