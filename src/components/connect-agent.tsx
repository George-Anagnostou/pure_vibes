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

// The standard, documented way each app adds a remote MCP server, key filled in.
// Claude Code: `claude mcp add` at user scope (every project). Codex: `codex mcp add
// --url`, bearer token from an env var. Claude Desktop: mcp-remote (its custom
// connectors only take OAuth).
export function clientSetups(origin: string, key: string) {
  const mcpUrl = `${origin}/api/mcp/mcp`;
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      steps: [
        {
          hint: "Paste into your terminal. Glass Box is added for every project.",
          code: `claude mcp add --transport http --scope user glassbox ${mcpUrl} --header "Authorization: Bearer ${key}"`,
        },
      ],
      after:
        "Start Claude Code (or restart it) and type /mcp. glassbox should say connected.",
    },
    {
      id: "codex",
      label: "Codex",
      steps: [
        {
          hint: "1. Save your key so Codex can send it:",
          code: `echo 'export GLASSBOX_API_KEY=${key}' >> ~/.zshrc && export GLASSBOX_API_KEY=${key}`,
        },
        {
          hint: "2. Add Glass Box to Codex:",
          code: `codex mcp add glassbox --url ${mcpUrl} --bearer-token-env-var GLASSBOX_API_KEY`,
        },
      ],
      after:
        "Open Codex in a new terminal and run /mcp. glassbox should be listed. On bash, use ~/.bashrc.",
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      steps: [
        {
          hint: "Settings → Developer → Edit Config. Add this to claude_desktop_config.json (needs Node.js):",
          code: JSON.stringify(
            {
              mcpServers: {
                glassbox: {
                  command: "npx",
                  args: [
                    "-y",
                    "mcp-remote",
                    mcpUrl,
                    "--header",
                    `Authorization: Bearer ${key}`,
                  ],
                },
              },
            },
            null,
            2,
          ),
        },
      ],
      after:
        "Quit and reopen Claude Desktop. Glass Box shows under the tools icon.",
    },
    {
      id: "other",
      label: "Cursor & others",
      steps: [
        {
          hint: "Cursor: .cursor/mcp.json (or Settings → MCP). Most MCP clients take the same JSON.",
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
          hint: "Only takes a URL? Use this one. The key is in it, so keep it private.",
          code: `${mcpUrl}?key=${key}`,
        },
      ],
      after: "Restart the client so it picks up Glass Box.",
    },
  ];
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

export function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.codeWrap}>
      <pre className={styles.codeBlock}>{code}</pre>
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
        className={styles.copyBtn}
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
          className={styles.btnDark}
          style={{ width: "100%" }}
        >
          {state.kind === "busy"
            ? "Getting your command…"
            : "Get my install command"}
        </button>
        {state.kind === "error" && (
          <p role="alert" className={styles.alertCard} style={{ marginTop: 8 }}>
            {state.message}
          </p>
        )}
      </div>
    );
  const { minutes } = state;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <p className={styles.stepNote}>
          Paste into your terminal, inside your project folder:
        </p>
        <CopyBlock code={state.command} />
      </div>
      <div>
        <p className={styles.stepNote}>…or paste into Claude Code:</p>
        <CopyBlock code={state.prompt} />
      </div>
      <p className={styles.smallBody} style={{ margin: 0 }}>
        Works once, for the next {minutes} minutes.{" "}
        <button type="button" onClick={issue} className={styles.mutedLink}>
          Get a new one
        </button>
      </p>
      <p className={styles.smallBody} style={{ margin: 0 }}>
        Then restart Claude Code in that folder, approve “glassbox” if it asks,
        and type <code>/mcp</code> to check it&apos;s connected.
      </p>
    </div>
  );
}

// Compact version for the inbox: mint a key, get the Claude Code command.
export function ConnectAgent() {
  return (
    <div>
      <p className={styles.smallBody} style={{ margin: "0 0 12px" }}>
        Claude Code, Codex, Cursor or Claude Desktop: get the one-line setup on{" "}
        <Link href="/connect" className={styles.mutedLink}>
          Connect
        </Link>
        .
      </p>
      <Link
        href="/connect"
        className={styles.btnDark}
        style={{
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
        }}
      >
        Connect an agent
      </Link>
    </div>
  );
}

// Full onboarding for /connect: one click makes a key, then the standard install
// command for each app with the key filled in.
export function AgentSetup({
  origin,
  onMinted,
}: {
  origin: string;
  onMinted?: () => void;
}) {
  const { state, mint } = useMint(onMinted);
  const [tab, setTab] = useState("claude-code");
  const key = state.kind === "done" ? state.key : KEY_PLACEHOLDER;
  const setups = clientSetups(origin, key);
  const active = setups.find((s) => s.id === tab) ?? setups[0];
  return (
    <>
      <section className={styles.connectCard}>
        <p className={styles.connectLabel}>1. Add Glass Box to your agent</p>
        {state.kind !== "done" ? (
          <>
            <p className={styles.stepNote}>
              Click once to create your key, then paste one command.
            </p>
            <button
              type="button"
              onClick={() => mint("My agent")}
              disabled={state.kind === "busy"}
              className={styles.btnDark}
              style={{ width: "100%" }}
            >
              {state.kind === "busy" ? "Creating your key…" : "Create my key"}
            </button>
            {state.kind === "error" && (
              <p
                role="alert"
                className={styles.alertCard}
                style={{ marginTop: 8 }}
              >
                {state.message}
              </p>
            )}
          </>
        ) : (
          <>
            <p
              role="status"
              className={styles.warnCard}
              style={{ margin: "0 0 14px" }}
            >
              Your key is filled in below and only shown now. Keep it private.
            </p>
            <div role="tablist" className={styles.tabRow}>
              {setups.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === active.id}
                  onClick={() => setTab(s.id)}
                  className={`${styles.tab} ${s.id === active.id ? styles.tabActive : ""}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" style={{ display: "grid", gap: 12 }}>
              {active.steps.map((step) => (
                <div key={step.hint}>
                  <p className={styles.stepNote}>{step.hint}</p>
                  <CopyBlock code={step.code} />
                </div>
              ))}
              <p className={styles.smallBody} style={{ margin: 0 }}>
                Then: {active.after}
              </p>
            </div>
          </>
        )}
      </section>

      <section className={styles.optCard}>
        <p className={styles.optCardTitle}>2. Give it a task</p>
        <p className={styles.smallBody} style={{ margin: 0 }}>
          Ask your agent for anything, like “book me dinner in San Francisco”.
          Before acting it checks in with Glass Box and sends you a link (it
          also appears on your{" "}
          <Link href="/dashboard" className={styles.mutedLink}>
            dashboard
          </Link>
          ). Rank what matters, correct how it would handle real situations, and
          it follows what you send.
        </p>
      </section>

      <details className={`${styles.optCard} ${styles.disclosure}`}>
        <summary>Optional: pop-up window for Claude Code</summary>
        <p className={styles.stepNote}>
          Opens Glass Box automatically whenever Claude Code checks in, keeps
          your choices in front of it, and blocks commands you ruled out. Run it
          in a project folder.
        </p>
        <InstallCommand onIssued={onMinted} />
      </details>

      <details className={`${styles.optCard} ${styles.disclosure}`}>
        <summary>REST API</summary>
        <div style={{ display: "grid", gap: 12 }}>
          {setupSnippets(origin, key)
            .filter((s) => s.id === "rest")
            .map((s) => (
              <div key={s.id}>
                <p className={styles.stepNote}>{s.hint}</p>
                <CopyBlock code={s.code} />
              </div>
            ))}
        </div>
      </details>
    </>
  );
}
