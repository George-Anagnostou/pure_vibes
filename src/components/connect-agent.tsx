"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "@/components/glassbox/glassbox.module.css";

const KEY_PLACEHOLDER = "gb_YOUR_KEY";

export type MintState =
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

export function useMint(onMinted?: () => void) {
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

export function setupSnippets(origin: string, key: string) {
  const mcpUrl = `${origin}/api/mcp/mcp`;
  return [
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

export function CopyBlock({ code }: { code: string }) {
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

export function MintForm({
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
        className={styles.inlineForm}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-label="Agent name"
          className={styles.fieldInput}
        />
        <button disabled={state.kind === "busy"} className={styles.btnDark}>
          {state.kind === "busy" ? "Creating…" : "Mint key"}
        </button>
      </form>
      {state.kind === "error" && (
        <p role="alert" className={styles.alertCard} style={{ marginTop: 8 }}>
          {state.message}
        </p>
      )}
    </>
  );
}

export function MintedKeyNotice({
  name,
  keyValue,
}: {
  name: string;
  keyValue: string;
}) {
  return (
    <div role="status" className={styles.warnCard} style={{ marginTop: 12 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        Copy “{name}” now — this is the only time it is shown.
      </p>
      <div style={{ marginTop: 8 }}>
        <CopyBlock code={keyValue} />
      </div>
      <p style={{ margin: "8px 0 0" }}>
        Anyone with this key can ask you for approvals as your agent. Keep it
        out of git; revoke it on Connect if it leaks.
      </p>
    </div>
  );
}

// Compact connect block for the dashboard: mint a key, paste one block.
export function ConnectAgent() {
  const { state, mint } = useMint();
  return (
    <div>
      <p className={styles.smallBody}>
        Mint a key, then paste the block into your agent. The key is shown once.
        Cursor, other MCP clients and the REST API are on{" "}
        <Link href="/connect" className={styles.mutedLink}>
          Connect
        </Link>
        .
      </p>
      <div style={{ marginTop: 12 }}>
        <MintForm state={state} onMint={mint} />
      </div>
      {state.kind === "done" && (
        <>
          <MintedKeyNotice name={state.name} keyValue={state.key} />
          <div style={{ marginTop: 12 }}>
            <CopyBlock code={agentPrompt(window.location.origin, state.key)} />
          </div>
        </>
      )}
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
    <div style={{ display: "grid", gap: 16 }}>
      <section className={styles.optCard}>
        <h2 className={styles.connectLabel}>1. Mint an agent key</h2>
        <p className={styles.smallBody} style={{ margin: "0 0 12px" }}>
          One key per agent or machine. Name it so you can recognize and revoke
          it later.
        </p>
        <MintForm state={state} onMint={mint} />
        {state.kind === "done" && (
          <MintedKeyNotice name={state.name} keyValue={state.key} />
        )}
      </section>

      <section className={styles.optCard}>
        <h2 className={styles.connectLabel}>2. Connect your agent</h2>
        <p className={styles.smallBody} style={{ margin: "0 0 4px" }}>
          MCP endpoint{" "}
          <code className="rounded bg-white/60 px-1 font-mono text-xs">
            {origin}/api/mcp/mcp
          </code>
          {state.kind !== "done" && (
            <>
              {" "}
              · snippets show{" "}
              <code className="font-mono text-xs">{KEY_PLACEHOLDER}</code> until
              you mint a key
            </>
          )}
        </p>
        <div style={{ display: "grid", gap: 18, marginTop: 14 }}>
          {setupSnippets(origin, key).map((s) => (
            <div key={s.id}>
              <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
                {s.title}
              </h3>
              <p className={styles.smallBody} style={{ margin: "2px 0 8px" }}>
                {s.hint}
              </p>
              <CopyBlock code={s.code} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.optCard}>
        <h2 className={styles.connectLabel}>3. Give it a task</h2>
        <p className={styles.smallBody} style={{ margin: 0 }}>
          Before acting, your agent calls <code>align</code> with its approach.
          You get a pop-up on your{" "}
          <Link href="/dashboard" className={styles.mutedLink}>
            dashboard
          </Link>{" "}
          to correct the decisions it is making for you, and it follows what you
          approve. In Claude Code you can also type{" "}
          <code>/mcp__glassbox__align</code> to make it realign.
        </p>
      </section>
    </div>
  );
}
