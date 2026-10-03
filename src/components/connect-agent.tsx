"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const KEY_PLACEHOLDER = "gb_YOUR_KEY";

type MintState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; key: string; name: string }
  | { kind: "error"; message: string };

async function mintKey(name: string): Promise<string> {
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
    throw new Error(body.error ?? `Could not create a key (${res.status}).`);
  return body.key;
}

function useMint(onMinted?: () => void) {
  const [state, setState] = useState<MintState>({ kind: "idle" });
  async function mint(name: string) {
    setState({ kind: "busy" });
    try {
      const key = await mintKey(name);
      setState({ kind: "done", key, name });
      onMinted?.();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Request failed.",
      });
    }
  }
  return { state, mint };
}

export function claudeCodeCommand(origin: string, key: string) {
  return `claude mcp add --transport http glassbox ${origin}/api/mcp/mcp --header "Authorization: Bearer ${key}"`;
}

// One block the human pastes into their agent's chat; the agent runs the kit
// installer itself (MCP server + hooks + CLAUDE.md), then asks for a restart.
export function agentPrompt(origin: string, key: string) {
  return `Connect this project to Glass Box so you check your plan with me before you act. From the project root, run:

curl -fsSL ${origin}/api/agent-kit/install.mjs -o glassbox-install.mjs
node glassbox-install.mjs . --key ${key} --url ${origin}
rm glassbox-install.mjs

Then tell me to restart Claude Code in this folder and approve the "glassbox" MCP server if asked. After the restart, run /mcp to confirm glassbox is connected.`;
}

// One terminal line: /install downloads and runs the agent kit installer.
export function installCommand(origin: string, key: string) {
  return `curl -fsSL ${origin}/install | sh -s -- ${key}`;
}

export function setupSnippets(origin: string, key: string) {
  const mcpUrl = `${origin}/api/mcp/mcp`;
  return [
    {
      id: "terminal",
      title: "Quickest: one line in your terminal",
      hint: `Run in your project folder. Sets up Glass Box for Claude Code (needs Node 18+). To keep the key out of your shell history, run "curl -fsSL ${origin}/install | sh" and paste the key when asked.`,
      code: installCommand(origin, key),
    },
    {
      id: "paste",
      title: "Easiest: paste this into your agent",
      hint: "Paste into Claude Code in your project. It installs Glass Box for you (MCP server, auto pop-up, and instructions to check in before acting).",
      code: agentPrompt(origin, key),
    },
    {
      id: "claude",
      title: "Claude Code",
      hint: "Run in your project directory. Then /mcp to confirm “glassbox” is connected.",
      code: claudeCodeCommand(origin, key),
    },
    {
      id: "kit",
      title: "Claude Code + auto pop-up (agent kit)",
      hint: "Installs the MCP server plus hooks that open the review window for you and keep the approved plan in context. Needs Node 18+.",
      code: `curl -fsSL ${origin}/api/agent-kit/install.mjs -o glassbox-install.mjs\nnode glassbox-install.mjs . --key ${key} --url ${origin}`,
    },
    {
      id: "cursor",
      title: "Cursor",
      hint: "Save as .cursor/mcp.json in your project (or ~/.cursor/mcp.json for all projects). Keep it out of git.",
      code: JSON.stringify(
        {
          mcpServers: {
            glassbox: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: "generic",
      title: "Any MCP client (JSON config)",
      hint: "Streamable HTTP transport with a bearer header.",
      code: JSON.stringify(
        {
          mcpServers: {
            glassbox: {
              type: "http",
              url: mcpUrl,
              headers: { Authorization: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: "query",
      title: "Clients that can't set headers",
      hint: "The key rides in the URL instead. It can end up in logs and history, so prefer the header when you can.",
      code: `${mcpUrl}?key=${key}`,
    },
    {
      id: "rest",
      title: "REST API",
      hint: "POST /api/review with the same fields as the MCP align tool; it returns review_id and align_url. Then poll the contract until the human approves.",
      code: `curl -X POST ${origin}/api/review \\\n  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d @approach.json\n\ncurl ${origin}/api/reviews/REVIEW_ID/contract \\\n  -H "Authorization: Bearer ${key}"`,
    },
  ];
}

function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-ink p-3 pr-20 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-white">
        {code}
      </pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
        className="absolute top-2 right-2 rounded-md bg-white/15 px-2 py-1 text-xs font-bold text-white hover:bg-white/25"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function MintForm({
  state,
  onMint,
}: {
  state: MintState;
  onMint: (name: string) => void;
}) {
  const [name, setName] = useState("Claude Code");
  return (
    <>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onMint(name);
        }}
        className="flex gap-2"
      >
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
    </>
  );
}

type InstallState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "error"; message: string }
  | { kind: "done"; command: string; prompt: string; minutes: number };

// The easy path: one button, one short line to paste. The code inside it works once
// for 15 minutes and mints a fresh agent key when it runs, so nobody copies a key.
export function InstallCommand({ onIssued }: { onIssued?: () => void }) {
  const [state, setState] = useState<InstallState>({ kind: "idle" });
  async function issue() {
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/install-codes", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        command?: string;
        claude_prompt?: string;
        expires_at?: string;
        error?: string;
      };
      if (!res.ok || !body.command)
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again."
            : (body.error ?? "Could not create an install command."),
        );
      setState({
        kind: "done",
        command: body.command,
        prompt: body.claude_prompt ?? body.command,
        minutes: body.expires_at
          ? Math.max(
              1,
              Math.round((Date.parse(body.expires_at) - Date.now()) / 60_000),
            )
          : 15,
      });
      onIssued?.();
    } catch (cause) {
      setState({
        kind: "error",
        message:
          cause instanceof Error ? cause.message : "Something went wrong.",
      });
    }
  }
  if (state.kind !== "done")
    return (
      <div>
        <button
          type="button"
          onClick={issue}
          disabled={state.kind === "busy"}
          className="min-h-12 w-full rounded-xl bg-ink px-5 text-base font-bold text-white hover:bg-ink/85 disabled:opacity-60"
        >
          {state.kind === "busy"
            ? "Getting your command…"
            : "Get my install command"}
        </button>
        {state.kind === "error" && (
          <p role="alert" className="mt-2 text-sm font-semibold text-stop">
            {state.message}
          </p>
        )}
      </div>
    );
  const { minutes } = state;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold">Paste into your terminal</h3>
        <p className="mb-2 text-sm text-ink-soft">
          Run it inside the project folder you use with Claude Code.
        </p>
        <CopyBlock code={state.command} />
      </div>
      <div>
        <h3 className="font-bold">…or paste into Claude Code</h3>
        <p className="mb-2 text-sm text-ink-soft">It runs the line for you.</p>
        <CopyBlock code={state.prompt} />
      </div>
      <p className="text-sm text-ink-soft">
        Works once, for the next {minutes} minutes.{" "}
        <button
          type="button"
          onClick={issue}
          className="font-semibold underline"
        >
          Get a new one
        </button>
      </p>
      <p className="rounded-xl bg-paper p-3 text-sm">
        <span className="font-bold">Then:</span> restart Claude Code in that
        folder, approve “glassbox” if it asks, and type <code>/mcp</code> to
        check it&apos;s connected.
      </p>
    </div>
  );
}

// Compact version for the inbox: mint a key, get the Claude Code command.
export function ConnectAgent() {
  return (
    <div>
      <p className="mb-3 text-sm text-ink-soft">
        One short command connects Claude Code. Cursor, other MCP clients and
        the REST API are on{" "}
        <Link href="/connect" className="font-semibold underline">
          Connect
        </Link>
        .
      </p>
      <InstallCommand />
    </div>
  );
}

// Full onboarding for /connect: mint once, then copy-paste setup per client.
export function AgentSetup({
  origin,
  onMinted,
}: {
  origin: string;
  onMinted?: () => void;
}) {
  const { state, mint } = useMint(onMinted);
  const key = state.kind === "done" ? state.key : KEY_PLACEHOLDER;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border-2 border-ink bg-card p-5">
        <h2 className="text-lg font-black">1. Connect Claude Code</h2>
        <p className="mt-1 mb-4 text-sm text-ink-soft">
          Click the button, then paste one line. No keys to copy.
        </p>
        <InstallCommand onIssued={onMinted} />
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-black">2. Give it a task</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Ask Claude Code for anything, e.g. “book me dinner in San Francisco”.
          Before acting it checks in with Glass Box and a window opens (or a
          link in your{" "}
          <Link href="/inbox" className="font-semibold underline">
            inbox
          </Link>
          ) where you rank what matters and correct how it would handle real
          situations. It follows what you send. Type{" "}
          <code>/mcp__glassbox__align</code> to make it check in again.
        </p>
      </section>

      <details className="rounded-2xl border border-line bg-card p-5">
        <summary className="cursor-pointer text-lg font-black">
          Other ways to connect
        </summary>
        <p className="mt-1 text-sm text-ink-soft">
          Cursor, any MCP client, the REST API, or setting things up by hand
          with an agent key.
        </p>
        <div className="mt-4 space-y-6">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-black">Mint an agent key</h2>
            <p className="mt-1 text-sm text-ink-soft">
              One key per agent or machine. Name it so you can recognize and
              revoke it later.
            </p>
            <div className="mt-3">
              <MintForm state={state} onMint={mint} />
            </div>
            {state.kind === "done" && (
              <div
                role="status"
                className="mt-3 rounded-xl bg-warn-bg p-3 text-sm text-warn"
              >
                <p className="font-bold">
                  Copy “{state.name}” now: this is the only time it is shown.
                </p>
                <div className="mt-2">
                  <CopyBlock code={state.key} />
                </div>
                <p className="mt-2">
                  Anyone with this key can ask you for approvals as your agent.
                  Keep it out of git; revoke it below if it leaks.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-black">Connect with a key</h2>
            <p className="mt-1 text-sm text-ink-soft">
              MCP endpoint{" "}
              <code className="rounded bg-paper px-1 font-mono text-xs">
                {origin}/api/mcp/mcp
              </code>
              {state.kind !== "done" && (
                <>
                  {" "}
                  · snippets show{" "}
                  <code className="font-mono text-xs">
                    {KEY_PLACEHOLDER}
                  </code>{" "}
                  until you mint a key
                </>
              )}
            </p>
            <div className="mt-4 space-y-5">
              {setupSnippets(origin, key).map((s) => (
                <div key={s.id}>
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="mb-2 text-sm text-ink-soft">{s.hint}</p>
                  <CopyBlock code={s.code} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
