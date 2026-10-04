"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import styles from "@/components/glassbox/glassbox.module.css";

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
  if (res.status === 401)
    throw new Error("Your session expired. Sign in again, then retry.");
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

export type ClientSetup = {
  id: string;
  label: string;
  hint: string;
  code: string;
  extra?: { hint: string; code: string };
  after: string;
  // Shown as "Something wrong? Remove it with <command> and paste the setup again."
  remove: { command: string } | { text: string };
};

// One copy-paste per app, key filled in once, each checked against the real client:
// - Claude Code: user scope (every project). `claude mcp add` refuses a name that
//   already exists, so the line first drops any older glassbox entry; re-running it
//   with a new key just works.
// - Codex: key on the URL (our MCP server accepts ?key=). One line, no env var, so
//   it also works in the Codex app and IDE extension, which don't read ~/.zshrc.
//   `codex mcp add` overwrites an existing entry. The URL is quoted because zsh
//   treats an unquoted `?` as a glob.
// - Claude Desktop: mcp-remote (custom connectors there only take OAuth). The header
//   goes through env because Claude Desktop splits args on spaces.
export function clientSetups(origin: string, key: string): ClientSetup[] {
  const mcpUrl = `${origin}/api/mcp/mcp`;
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "Paste into your terminal. Works in every project, and is safe to run again.",
      code: `claude mcp remove glassbox -s user 2>/dev/null; claude mcp add --transport http --scope user glassbox ${mcpUrl} --header "Authorization: Bearer ${key}"`,
      after:
        "Start a new Claude Code session and type /mcp. glassbox should say connected.",
      remove: { command: "claude mcp remove glassbox -s user" },
    },
    {
      id: "codex",
      label: "Codex",
      hint: "Paste into your terminal. Covers the Codex CLI, app and IDE extension.",
      code: `codex mcp add glassbox --url "${mcpUrl}?key=${key}"`,
      after:
        "Start a new Codex session and type /mcp. glassbox should be listed with its tools.",
      remove: { command: "codex mcp remove glassbox" },
    },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      hint: "Settings → Developer → Edit Config. Put this in claude_desktop_config.json (if mcpServers is already there, add just the glassbox entry). Needs Node.js.",
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
                "Authorization:${AUTH_HEADER}",
              ],
              env: { AUTH_HEADER: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      ),
      after:
        "Quit and reopen Claude Desktop. Glass Box shows under the tools icon.",
      remove: { text: "deleting the glassbox entry" },
    },
    {
      id: "other",
      label: "Cursor & others",
      hint: "Cursor: save as ~/.cursor/mcp.json (or Settings → MCP → Add). Most MCP clients take the same JSON.",
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
      extra: {
        hint: "App only takes a URL? Use this one (the key is in it, so keep it private):",
        code: `${mcpUrl}?key=${key}`,
      },
      after: "Restart the app so it picks up Glass Box.",
      remove: { text: "deleting the glassbox entry" },
    },
  ];
}

// Optional Claude Code extras (pop-up hooks + CLAUDE.md), same key as everything else.
export function installCommand(origin: string, key: string) {
  return `curl -fsSL ${origin}/install | sh -s -- ${key}`;
}

export function restSnippet(origin: string, key: string) {
  return `curl -X POST ${origin}/api/review \\\n  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d @approach.json\n\ncurl ${origin}/api/reviews/REVIEW_ID/contract \\\n  -H "Authorization: Bearer ${key}"`;
}

export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const preRef = useRef<HTMLPreElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      // Clipboard blocked (permissions, non-HTTPS, embedded browser): select the
      // text so one ⌘C / Ctrl+C still copies it.
      const pre = preRef.current;
      const selection = window.getSelection();
      if (pre && selection) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setStatus("manual");
    }
    setTimeout(() => setStatus("idle"), 2500);
  }
  return (
    <div className={styles.codeWrap}>
      <pre ref={preRef} className={styles.codeBlock} aria-label={label}>
        {code}
      </pre>
      <button type="button" onClick={copy} className={styles.copyBtn}>
        {status === "copied"
          ? "Copied"
          : status === "manual"
            ? "Press ⌘C"
            : "Copy"}
      </button>
    </div>
  );
}

// Compact card for the dashboard: setup lives on /connect, where the key is minted.
export function ConnectAgent() {
  return (
    <div>
      <p className={styles.smallBody} style={{ margin: "0 0 12px" }}>
        Claude Code, Codex, Cursor or Claude Desktop: create a key and get the
        one-line setup on{" "}
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

function SetupTabs({ origin, keyValue }: { origin: string; keyValue: string }) {
  const [tab, setTab] = useState("claude-code");
  const setups = clientSetups(origin, keyValue);
  const active = setups.find((s) => s.id === tab) ?? setups[0];
  return (
    <>
      <div role="tablist" aria-label="Your app" className={styles.tabRow}>
        {setups.map((s) => (
          <button
            key={s.id}
            id={`tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={s.id === active.id}
            aria-controls="setup-panel"
            onClick={() => setTab(s.id)}
            className={`${styles.tab} ${s.id === active.id ? styles.tabActive : ""}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        id="setup-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active.id}`}
        style={{ display: "grid", gap: 12 }}
      >
        <div>
          <p className={styles.stepNote}>{active.hint}</p>
          <CopyBlock code={active.code} label={`${active.label} setup`} />
        </div>
        {active.extra && (
          <div>
            <p className={styles.stepNote}>{active.extra.hint}</p>
            <CopyBlock code={active.extra.code} />
          </div>
        )}
        <p className={styles.smallBody} style={{ margin: 0 }}>
          <strong style={{ fontWeight: 600, color: "#000" }}>Then:</strong>{" "}
          {active.after}
        </p>
        <p
          className={styles.smallBody}
          style={{ margin: 0, fontSize: "0.78rem" }}
        >
          Something wrong? Remove it by{" "}
          {"command" in active.remove ? (
            <>
              running <code>{active.remove.command}</code>
            </>
          ) : (
            active.remove.text
          )}{" "}
          and paste the setup again.
        </p>
      </div>
    </>
  );
}

// Full onboarding for /connect. One click makes one key; every snippet on the page
// (all four apps, the pop-up installer, REST) uses that same key. The key is never
// stored in the browser, so after a refresh the page asks for a new one instead of
// showing placeholder commands.
export function AgentSetup({
  origin,
  keyCount,
  onMinted,
}: {
  origin: string;
  keyCount: number;
  onMinted?: () => void;
}) {
  const { state, mint } = useMint(onMinted);
  const key = state.kind === "done" ? state.key : null;
  const hasOldKeys = keyCount > 0;
  return (
    <>
      <section className={styles.connectCard}>
        <p className={styles.connectLabel}>1. Add Glass Box to your agent</p>
        {key === null ? (
          <>
            <p className={styles.stepNote}>
              {hasOldKeys
                ? "Keys are shown only once, so your setup commands aren't shown again after a refresh. Create a new key to get them; you can revoke old keys below."
                : "Click once to create your key, then paste one command into your app."}
            </p>
            <button
              type="button"
              onClick={() => mint(`Agent key ${keyCount + 1}`)}
              disabled={state.kind === "busy"}
              className={styles.btnDark}
              style={{ width: "100%" }}
            >
              {state.kind === "busy"
                ? "Creating your key…"
                : hasOldKeys
                  ? "Create a new key"
                  : "Create my key"}
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
              Your key is in every command below. It&apos;s shown only now, so
              set up your apps before you leave this page. Keep it private.
            </p>
            <SetupTabs origin={origin} keyValue={key} />
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

      {key !== null && (
        <>
          <details className={`${styles.optCard} ${styles.disclosure}`}>
            <summary>Optional: pop-up window for Claude Code</summary>
            <p className={styles.stepNote}>
              Opens Glass Box automatically whenever Claude Code checks in,
              keeps your choices in front of it, and blocks commands you ruled
              out. Run it inside a project folder (needs Node.js 18+); it uses
              the same key.
            </p>
            <CopyBlock code={installCommand(origin, key)} />
            <p className={styles.smallBody} style={{ margin: "10px 0 0" }}>
              Then restart Claude Code in that folder, approve “glassbox” if it
              asks, and type <code>/mcp</code>.
            </p>
          </details>

          <details className={`${styles.optCard} ${styles.disclosure}`}>
            <summary>REST API</summary>
            <p className={styles.stepNote}>
              POST /api/review with the same fields as the MCP align tool; it
              returns review_id and align_url. Then poll the contract until the
              human approves.
            </p>
            <CopyBlock code={restSnippet(origin, key)} />
          </details>
        </>
      )}
    </>
  );
}
