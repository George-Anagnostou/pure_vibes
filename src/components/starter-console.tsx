"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Database, Json } from "@/types/database";

type Run = Database["public"]["Tables"]["workflow_runs"]["Row"];

async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Request failed. Please try again.");
  return data as T;
}

export function StarterConsole({
  configured,
  email,
  billing,
}: {
  configured: boolean;
  email: string | null;
  billing: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState<Json | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);

  async function perform(name: string, operation: () => Promise<void>) {
    setBusy(name);
    setMessage("");
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Request failed. Please retry.",
      );
    } finally {
      setBusy(null);
    }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    void perform("sign-in", async () => {
      const result = await api<{ message: string }>("/api/auth/sign-in", {
        email,
      });
      setMessage(result.message);
    });
  }

  function workflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brief = new FormData(event.currentTarget).get("brief");
    void perform("workflow", async () => {
      setOutput(null);
      const result = await api<{ output: Json }>("/api/workflows", { brief });
      setOutput(result.output);
      setMessage("Workflow completed and saved.");
      if (runs)
        setRuns(
          (await api<{ runs: Run[] }>("/api/workflows", undefined, "GET")).runs,
        );
    });
  }

  return (
    <>
      <section>
        <h2>Account</h2>
        {email ? (
          <>
            <p>
              Signed in as <strong>{email}</strong>
            </p>
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() =>
                void perform("sign-out", async () => {
                  await api("/api/auth/sign-out");
                  setRuns(null);
                  setOutput(null);
                  router.refresh();
                })
              }
            >
              {busy === "sign-out" ? "Signing out…" : "Sign out"}
            </button>
          </>
        ) : (
          <form onSubmit={signIn}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              disabled={!configured || !!busy}
            />
            <div className="actions">
              <button disabled={!configured || !!busy}>
                {busy === "sign-in" ? "Sending…" : "Send sign-in link"}
              </button>
            </div>
          </form>
        )}
      </section>
      <section>
        <h2>Brief → action plan</h2>
        <p className="muted">
          Two AI steps: clarify a brief, then generate a structured plan. Runs
          are saved to your Supabase account. Limit: 10 runs per hour.
        </p>
        <form onSubmit={workflow}>
          <label htmlFor="brief">What do you want to build?</label>
          <textarea
            id="brief"
            name="brief"
            minLength={10}
            maxLength={4000}
            required
            placeholder="Describe the idea, who it helps, and any constraints…"
            disabled={!email || !!busy}
          />
          <div className="actions">
            <button disabled={!email || !!busy}>
              {busy === "workflow" ? "Generating plan…" : "Run workflow"}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={!email || !!busy}
              onClick={() =>
                void perform("history", async () => {
                  setRuns(
                    (
                      await api<{ runs: Run[] }>(
                        "/api/workflows",
                        undefined,
                        "GET",
                      )
                    ).runs,
                  );
                })
              }
            >
              {busy === "history" ? "Loading…" : "Load recent runs"}
            </button>
          </div>
        </form>
        {!email && (
          <p className="muted">
            Sign in to run a workflow and view your history.
          </p>
        )}
        {output && (
          <div aria-live="polite">
            <h3>Generated plan</h3>
            <pre>{JSON.stringify(output, null, 2)}</pre>
          </div>
        )}
        {runs && (
          <>
            <h3>Recent runs</h3>
            {runs.length === 0 ? (
              <p>No runs yet. Your first plan will appear here.</p>
            ) : (
              runs.map((run) => (
                <details key={run.id}>
                  <summary>
                    {run.input.slice(0, 70)} — {run.status}
                  </summary>
                  <p className="muted">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                  {run.output ? (
                    <pre>{JSON.stringify(run.output, null, 2)}</pre>
                  ) : (
                    <p>
                      {run.error ??
                        "No result saved yet. If this persists, the request may have been interrupted."}
                    </p>
                  )}
                </details>
              ))
            )}
          </>
        )}
      </section>
      <section>
        <h2>Billing</h2>
        <p>{email ? billing : "Sign in to test subscriptions."}</p>
        <p className="muted">
          The price and currency are shown in Stripe Checkout. Use your team’s
          Stripe test-mode configuration during development.
        </p>
        <div className="actions">
          <button
            disabled={!email || !!busy}
            onClick={() =>
              void perform("checkout", async () => {
                const { url } = await api<{ url: string }>(
                  "/api/billing/checkout",
                );
                window.location.assign(url);
              })
            }
          >
            {busy === "checkout" ? "Opening Checkout…" : "Start subscription"}
          </button>
          <button
            className="secondary"
            disabled={!email || !!busy}
            onClick={() =>
              void perform("portal", async () => {
                const { url } = await api<{ url: string }>(
                  "/api/billing/portal",
                );
                window.location.assign(url);
              })
            }
          >
            {busy === "portal" ? "Opening billing…" : "Manage billing"}
          </button>
          <button
            className="secondary"
            disabled={!email || !!busy}
            onClick={() => router.refresh()}
          >
            Refresh status
          </button>
        </div>
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
