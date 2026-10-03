"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "@/components/glassbox/glassbox.module.css";
export function ConfirmSignIn({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: string;
  next: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    window.history.replaceState(null, "", "/auth/confirm");
  }, []);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type, next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not sign in.");
      window.location.replace(body.next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign in. Try again.",
      );
      setBusy(false);
    }
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {tokenHash ? (
        <button onClick={confirm} disabled={busy} className={styles.submit}>
          {busy ? "Signing in…" : "Continue to Glass Box"}
        </button>
      ) : (
        <p role="alert" className={styles.warnCard}>
          Open the newest link in your email, or request another below.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.alertCard}>
          {error}
        </p>
      )}
      <p style={{ textAlign: "center", margin: 0 }}>
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className={styles.mutedLink}
        >
          Request a new email
        </Link>
      </p>
    </div>
  );
}
