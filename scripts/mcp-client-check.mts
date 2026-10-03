// Connectivity check for a Glass Box MCP endpoint, the way an outside MCP client sees it.
// Speaks raw JSON-RPC over fetch (streamable HTTP), so it needs no MCP client SDK.
//
//   node scripts/mcp-client-check.mts --url https://app.example.com --key gb_...
//   GLASSBOX_URL=... GLASSBOX_AGENT_KEY=gb_... node scripts/mcp-client-check.mts
//
// Options:
//   --query       send the key as ?key=gb_... instead of the Authorization header
//   --align       also call `align` with a tiny 2-step plan (one LLM call; creates a
//                 pending review) and check its align_url uses the same origin as --url
//   --throwaway   create a temporary user + agent key with the Supabase admin client
//                 (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY, e.g.
//                 `node --env-file=.env.local ...`), run the checks, then delete the user
//   --bypass TOKEN  Vercel protection-bypass token for protected preview deployments
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(name);

const base = (
  flag("--url") ??
  process.env.GLASSBOX_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
const endpoint = `${base}/api/mcp/mcp`;
const bypass = flag("--bypass") ?? process.env.VERCEL_PROTECTION_BYPASS;
let key = flag("--key") ?? process.env.GLASSBOX_AGENT_KEY;
let failures = 0;

function check(cond: unknown, label: string, detail?: unknown) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(
      `  FAIL ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`,
    );
  }
}

function headersFor(
  auth: "header" | "none",
  extra: Record<string, string> = {},
) {
  const h: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...extra,
  };
  if (auth === "header" && key && !has("--query"))
    h.authorization = `Bearer ${key}`;
  if (bypass) h["x-vercel-protection-bypass"] = bypass;
  return h;
}

function urlFor(auth: "header" | "none") {
  return auth === "header" && key && has("--query")
    ? `${endpoint}?key=${encodeURIComponent(key)}`
    : endpoint;
}

// A streamable-HTTP response is either JSON or an SSE stream of `data:` frames.
async function readRpc(res: Response): Promise<Record<string, unknown> | null> {
  const body = await res.text();
  if (!body.trim()) return null;
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const frames = body
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => JSON.parse(l.slice(5)));
    return frames.at(-1) ?? null;
  }
  return JSON.parse(body);
}

let sessionId: string | undefined;
let nextId = 1;
async function rpc(method: string, params: unknown = {}, notify = false) {
  const extra: Record<string, string> = {};
  if (sessionId) extra["mcp-session-id"] = sessionId;
  const res = await fetch(urlFor("header"), {
    method: "POST",
    // Send a foreign Origin like a browser-based client (MCP Inspector) would.
    headers: headersFor("header", {
      "mcp-protocol-version": "2025-06-18",
      origin: "http://localhost:6274",
      ...extra,
    }),
    body: JSON.stringify(
      notify
        ? { jsonrpc: "2.0", method, params }
        : { jsonrpc: "2.0", id: nextId++, method, params },
    ),
    signal: AbortSignal.timeout(90_000),
  });
  sessionId = res.headers.get("mcp-session-id") ?? sessionId;
  if (method === "initialize")
    check(
      res.headers.get("access-control-allow-origin") === "*",
      "CORS header on the authenticated response",
    );
  if (!res.ok && !notify)
    throw new Error(`${method}: HTTP ${res.status} ${await res.text()}`);
  return notify ? null : readRpc(res);
}

type ToolResult = {
  isError?: boolean;
  content?: { type: string; text: string }[];
};
const toolText = (r: Record<string, unknown> | null) =>
  ((r?.result as ToolResult | undefined)?.content ?? [])
    .map((c) => c.text)
    .join("\n");

let cleanup: (() => Promise<void>) | undefined;
if (has("--throwaway")) {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await admin.auth.admin.createUser({
    email: `mcp-check-${Date.now()}@glassbox.test`,
    password: randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (error) throw error;
  key = `gb_${randomBytes(24).toString("base64url")}`;
  const { error: keyErr } = await admin.from("agent_keys").insert({
    user_id: data.user.id,
    name: "mcp-client-check",
    key_hash: createHash("sha256").update(key).digest("hex"),
  });
  if (keyErr) throw keyErr;
  console.log(`throwaway user ${data.user.id} + agent key created`);
  cleanup = async () => {
    await admin.auth.admin.deleteUser(data.user.id);
    console.log("throwaway user deleted");
  };
}

try {
  console.log(
    `Glass Box MCP check against ${endpoint}${has("--query") ? " (key via ?key=)" : ""}`,
  );

  console.log("\n== health");
  const health = await fetch(`${base}/api/health`, {
    headers: headersFor("none"),
  });
  check(health.ok, `GET /api/health -> ${health.status}`);

  console.log("\n== unauthenticated");
  const anon = await fetch(endpoint, {
    method: "POST",
    headers: headersFor("none"),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {},
    }),
  });
  const anonBody = await anon.text();
  check(anon.status === 401, `POST without key -> ${anon.status}`);
  check(
    anon.headers.get("www-authenticate")?.startsWith("Bearer"),
    `WWW-Authenticate: ${anon.headers.get("www-authenticate")}`,
  );
  console.log(`  body ${anonBody}`);

  const bad = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...headersFor("none"),
      authorization: "Bearer gb_not_a_real_key",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {},
    }),
  });
  check(bad.status === 401, `POST with unknown key -> ${bad.status}`);

  console.log("\n== CORS preflight");
  const pre = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:6274",
      "access-control-request-method": "POST",
      "access-control-request-headers":
        "authorization,content-type,mcp-protocol-version",
      ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}),
    },
  });
  check(pre.status === 204 || pre.status === 200, `OPTIONS -> ${pre.status}`);
  check(
    pre.headers.get("access-control-allow-origin") === "*",
    `Access-Control-Allow-Origin: ${pre.headers.get("access-control-allow-origin")}`,
  );
  check(
    /authorization/i.test(
      pre.headers.get("access-control-allow-headers") ?? "",
    ),
    "Access-Control-Allow-Headers includes Authorization",
  );

  if (!key) {
    console.log(
      "\nNo agent key (--key, GLASSBOX_AGENT_KEY or --throwaway): skipping authenticated checks.",
    );
  } else {
    console.log("\n== initialize");
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "glassbox-mcp-client-check", version: "1.0.0" },
    });
    const info = (
      init?.result as { serverInfo?: { name: string; version: string } }
    )?.serverInfo;
    check(info?.name, `serverInfo ${info?.name} ${info?.version}`, init);
    await rpc("notifications/initialized", {}, true);

    console.log("\n== tools/list + prompts/list");
    const tools = await rpc("tools/list");
    const toolNames = (
      (tools?.result as { tools?: { name: string }[] })?.tools ?? []
    ).map((t) => t.name);
    check(
      toolNames.includes("align") && toolNames.includes("get_contract"),
      `tools: ${toolNames.join(", ")}`,
    );
    const prompts = await rpc("prompts/list");
    const promptNames = (
      (prompts?.result as { prompts?: { name: string }[] })?.prompts ?? []
    ).map((p) => p.name);
    check(promptNames.length > 0, `prompts: ${promptNames.join(", ")}`);

    console.log("\n== get_contract on a review that does not exist");
    const t0 = Date.now();
    const missing = await rpc("tools/call", {
      name: "get_contract",
      arguments: { review_id: "00000000-0000-4000-8000-000000000000" },
    });
    const missingText = toolText(missing);
    check(
      (missing?.result as ToolResult | undefined)?.isError === true,
      `isError in ${Date.now() - t0}ms: ${missingText}`,
      missing,
    );

    if (has("--align")) {
      console.log("\n== align (creates a pending review; one LLM call)");
      const t1 = Date.now();
      const aligned = await rpc("tools/call", {
        name: "align",
        arguments: {
          task: "MCP connectivity check: summarize a README",
          agent_name: "mcp-client-check",
          steps: [
            {
              name: "Read the README",
              how: "Read README.md from the repo",
              uses: ["Read"],
              est_tokens: 2000,
              est_cost_usd: 0.01,
              why: "Need the content",
              source: "request",
            },
            {
              name: "Write a 3-line summary",
              how: "Summarize in plain text",
              uses: [],
              est_tokens: 500,
              est_cost_usd: 0.005,
              why: "Asked for a summary",
              source: "request",
            },
          ],
        },
      });
      const alignedText = toolText(aligned);
      let parsed: { align_url?: string; review_id?: string } = {};
      try {
        parsed = JSON.parse(alignedText);
      } catch {
        // reported below
      }
      check(
        parsed.review_id,
        `review ${parsed.review_id} in ${Date.now() - t1}ms`,
        alignedText,
      );
      check(
        parsed.align_url?.startsWith(`${base}/align/`),
        `align_url ${parsed.align_url} is on ${base}`,
      );
    }
  }
} finally {
  await cleanup?.();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exitCode = failures ? 1 : 0;
