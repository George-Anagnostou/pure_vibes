"use client";

import { useState, type FormEvent } from "react";

export function ConnectAgent() {
  const [name, setName] = useState("Claude Code");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "done"; command: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  async function mint(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "busy" });
    setCopied(false);
    try {
      const res = await fetch("/api/agent-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Agent" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        key?: string;
        error?: string;
      };
      if (!res.ok || !body.key)
        throw new Error(
          body.error ?? `Could not create a key (${res.status}).`,
        );
      const command = `claude mcp add --transport http glassbox ${window.location.origin}/api/mcp/mcp --header "Authorization: Bearer ${body.key}"`;
      setState({ kind: "done", command });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Mint a key, then run the command where your agent lives. The key is
        shown once.
      </p>
      <form onSubmit={mint} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-label="Agent name"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 outline-none focus:border-ink"
        />
        <button
          disabled={state.kind === "busy"}
          className="min-h-11 rounded-xl bg-ink px-4 font-bold text-white disabled:opacity-60"
        >
          {state.kind === "busy" ? "Creating…" : "Mint key"}
        </button>
      </form>
      {state.kind === "error" && (
        <p role="alert" className="mt-2 text-sm font-semibold text-stop">
          {state.message}
        </p>
      )}
      {state.kind === "done" && (
        <div className="mt-3">
          <pre className="rounded-xl bg-ink p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-white">
            {state.command}
          </pre>
          <button
            type="button"
            onClick={() => copy(state.command)}
            className="mt-2 rounded-lg border-2 border-ink px-3 py-1.5 text-sm font-bold"
          >
            {copied ? "Copied" : "Copy command"}
          </button>
        </div>
      )}
    </div>
  );
}
