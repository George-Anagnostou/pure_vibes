"use client";

import { useId, useState, type FormEvent } from "react";
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
      setError("Wait a minute before requesting another email.");
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
      if (!res.ok) throw new Error(body.error ?? "Could not send an email.");
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
    <div className="space-y-5">
      <form onSubmit={send} className="space-y-3">
        <label htmlFor={`${id}-email`} className="block text-sm font-semibold">
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
          className="min-h-12 w-full rounded-xl border border-line bg-card px-4 text-base outline-none focus:border-ink"
        />
        <button
          disabled={busy !== null}
          className="min-h-12 w-full rounded-xl bg-ink px-5 font-bold text-white hover:bg-ink/85 disabled:opacity-60"
        >
          {busy === "send"
            ? "Sending…"
            : sentTo
              ? "Send a new email"
              : "Email me a sign-in link"}
        </button>
      </form>
      {message && (
        <p
          role="status"
          className="rounded-xl bg-go-bg p-4 text-sm font-semibold text-go"
        >
          {message}
        </p>
      )}
      {showCode ? (
        <form onSubmit={verify} className="space-y-3 border-t border-line pt-5">
          <label
            htmlFor={`${id}-token`}
            className="block text-sm font-semibold"
          >
            If your email includes a code
          </label>
          <p className="text-sm text-ink-soft">
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
            className="min-h-12 w-full rounded-xl border border-line bg-card px-4 text-lg tracking-widest outline-none focus:border-ink"
          />
          <button
            disabled={busy !== null || !email.trim()}
            className="min-h-12 w-full rounded-xl border-2 border-ink px-5 font-bold disabled:opacity-60"
          >
            {busy === "verify" ? "Signing in…" : "Verify code and sign in"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCode(true)}
          className="text-sm underline underline-offset-4"
        >
          I already have a sign-in code
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-stop">
          {error}
        </p>
      )}
    </div>
  );
}
