"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentSetup } from "@/components/connect-agent";
import styles from "@/components/glassbox/glassbox.module.css";

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
    <section className={styles.optCard}>
      <h2 className={styles.connectLabel}>Your agent keys</h2>
      {keys.length === 0 ? (
        <p className={styles.smallBody} style={{ margin: 0 }}>
          No keys yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {keys.map((k) => (
            <li
              key={k.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
              }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {k.name}
                </span>
                <span
                  className={styles.smallBody}
                  style={{ fontSize: "0.72rem" }}
                  suppressHydrationWarning
                >
                  Created {when(k.created_at)} · Last used{" "}
                  {when(k.last_used_at)}
                </span>
              </span>
              <button
                type="button"
                disabled={busy === k.id}
                onClick={() => revoke(k)}
                className={styles.btnSecondary}
                style={{
                  width: "auto",
                  minHeight: 36,
                  padding: "0 14px",
                  color: "#c81e1e",
                  borderColor: "rgba(200, 30, 30, 0.4)",
                }}
              >
                {busy === k.id ? "Revoking…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className={styles.alertCard} style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </section>
  );
}
