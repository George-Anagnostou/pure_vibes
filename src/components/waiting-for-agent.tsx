"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/components/glassbox/glassbox.module.css";

// After this long without answers, the agent has probably stopped (crashed, lost its
// MCP connection, or ignored the challenges). Let the human stop the review.
export const STALLED_AFTER_MS = 90_000;

// Shown while the agent is still answering Glass Box's challenges; refreshes until ready.
export function WaitingForAgent({
  agentName,
  reviewId,
  createdAt,
}: {
  agentName: string;
  reviewId: string;
  createdAt: string;
}) {
  const router = useRouter();
  const [stalled, setStalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const started = Date.parse(createdAt);
    const tick = () => {
      if (Date.now() - started > STALLED_AFTER_MS) setStalled(true);
      router.refresh();
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => clearInterval(t);
  }, [router, createdAt]);

  async function stop() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/reviews/${reviewId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not stop it.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not stop it.");
      setBusy(false);
    }
  }

  if (!stalled)
    return (
      <p className="gb-pulse rounded-xl border border-dashed border-line bg-card p-4 text-[14px] text-ink-soft">
        Glass Box is interviewing {agentName} with real-world challenges. Its
        answers will appear here in a moment…
      </p>
    );

  return (
    <div
      role="status"
      className="rounded-xl border border-line bg-card p-4 text-[14px] text-ink-soft"
    >
      <p style={{ margin: "0 0 12px" }}>
        {agentName} hasn&apos;t answered Glass Box&apos;s questions. It may have
        stopped. This page keeps checking; you can also stop this request so it
        doesn&apos;t go ahead.
      </p>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className={styles.btnSecondary}
      >
        {busy ? "Stopping…" : "Stop"}
      </button>
      {error && (
        <p role="alert" className={styles.alertCard} style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
