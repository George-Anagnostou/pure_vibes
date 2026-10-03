"use client";

import { useId, useState, type FormEvent } from "react";
import styles from "@/components/glassbox/glassbox.module.css";

export const NEXT_PATH_KEY = "glassbox:next";

export function SignInForm({
  nextPath = "/account",
  allowExistingCode = false,
}: {
  nextPath?: string;
  allowExistingCode?: boolean;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [showCode, setShowCode] = useState(allowExistingCode);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (Date.now() < retryAt) {
      setError(
        "We just sent you an email. Use the sign-in code in it, or wait a minute to request another.",
      );
      return;
    }
    setBusy("send");
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next: nextPath }),
      });
      const body = await res.json();
      // Email limit reached: an earlier email's code may still work, so show the box.
      if (res.status === 429) setShowCode(true);
      if (!res.ok)
        throw new Error(
          body.error ??
            (res.status === 429
              ? "We've hit our email limit for now. Try again in a little while, or if you already got an email, use the sign-in code in it."
              : "Could not send an email."),
        );
      setSentTo(email.trim());
      setShowCode(true);
      setRetryAt(Date.now() + 60_000);
      setMessage(body.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send an email. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(
      new FormData(event.currentTarget).get("token") ?? "",
    ).trim();
    setBusy("verify");
    setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: sentTo || email.trim(),
          token,
          next: nextPath,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not verify the code.");
      window.location.replace(body.next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign in. Try again.",
      );
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={send}>
        <div className={styles.fieldGroup}>
          <label htmlFor={`${id}-email`} className={styles.fieldLabel}>
            Email
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSentTo("");
              setMessage("");
            }}
            placeholder="you@example.com"
            disabled={busy !== null}
            className={styles.fieldInput}
          />
        </div>
        <button disabled={busy !== null} className={styles.submit}>
          {busy === "send"
            ? "Sending…"
            : sentTo
              ? "Send a new email"
              : "Email me a sign-in link"}
        </button>
      </form>
      {message && (
        <p role="status" className={styles.statusCard}>
          {message}
        </p>
      )}
      {showCode ? (
        <form
          onSubmit={verify}
          style={{
            borderTop: "1px solid rgba(0, 0, 0, 0.1)",
            paddingTop: 16,
            display: "grid",
            gap: 10,
          }}
        >
          <label htmlFor={`${id}-token`} className={styles.fieldLabel}>
            If your email includes a code
          </label>
          <p className={styles.smallBody} style={{ margin: 0 }}>
            Use the email address above. A code works even if you opened the
            email on another device.
          </p>
          <input
            id={`${id}-token`}
            name="token"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6,10}"
            minLength={6}
            maxLength={10}
            autoComplete="one-time-code"
            required
            disabled={busy !== null}
            className={styles.fieldInput}
            style={{ letterSpacing: "0.3em", fontSize: "1.05rem" }}
          />
          <button
            disabled={busy !== null || !email.trim()}
            className={styles.btnSecondary}
          >
            {busy === "verify" ? "Signing in…" : "Verify code and sign in"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCode(true)}
          className={styles.mutedLink}
          style={{ justifySelf: "start" }}
        >
          I already have a sign-in code
        </button>
      )}
      {error && (
        <p role="alert" className={styles.alertCard}>
          {error}
        </p>
      )}
    </div>
  );
}
