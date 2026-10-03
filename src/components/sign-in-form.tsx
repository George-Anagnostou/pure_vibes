"use client";

import { useState, type FormEvent } from "react";

export const NEXT_PATH_KEY = "glassbox:next";

// Magic-link sign-in via the existing /api/auth/sign-in route. The callback
// always lands on "/", so remember where to go next in this browser.
export function SignInForm({ nextPath }: { nextPath?: string }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "sent"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    setState({ kind: "busy" });
    try {
      if (nextPath) {
        try {
          localStorage.setItem(NEXT_PATH_KEY, nextPath);
        } catch {
          // Storage can be unavailable (private mode); the link still works.
        }
      }
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Could not send a link.");
      setState({
        kind: "sent",
        message: body.message ?? "Check your email for a sign-in link.",
      });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Could not send a link.",
      });
    }
  }

  if (state.kind === "sent") {
    return (
      <p
        role="status"
        className="rounded-xl bg-go-bg p-4 font-semibold text-go"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="email" className="block text-sm font-semibold">
        Email
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          disabled={state.kind === "busy"}
          className="min-h-12 flex-1 rounded-xl border border-line bg-card px-4 text-base outline-none focus:border-ink"
        />
        <button
          disabled={state.kind === "busy"}
          className="min-h-12 rounded-xl bg-ink px-5 font-bold text-white hover:bg-ink/85 disabled:opacity-60"
        >
          {state.kind === "busy" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </div>
      {state.kind === "error" && (
        <p role="alert" className="text-sm font-semibold text-stop">
          {state.message}
        </p>
      )}
    </form>
  );
}
