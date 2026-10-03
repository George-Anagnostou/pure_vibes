// Security + connectivity check for Glass Box: full MCP flow for one user and
// cross-user isolation (MCP, REST, pages, Supabase direct, Realtime).
//
//   node --env-file=.env.local scripts/security-check.mts [--url http://localhost:3007]
//
// Options / env:
//   --url URL           app origin (default GLASSBOX_URL or http://localhost:3000)
//   --bypass TOKEN      Vercel protection-bypass secret (or VERCEL_PROTECTION_BYPASS)
//   --skip-db           skip the direct-Supabase and Realtime checks (section 3)
//   --skip-llm          skip checks that call the model (align); isolation still runs
//                       against reviews inserted with the admin client
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// SUPABASE_SECRET_KEY for the SAME Supabase project the app uses. Creates two
// throwaway users (A and B), each with an agent key, and deletes them at the end.
// Prints PASS/FAIL per check; exit code 1 if anything failed. Never prints keys.
import { createHash, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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
const bypass = flag("--bypass") ?? process.env.VERCEL_PROTECTION_BYPASS;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- reporting ----------
const results: { section: string; name: string; pass: boolean; ev: string }[] =
  [];
let section = "";
const secrets: string[] = [];
const scrub = (s: string) =>
  secrets.reduce((out, k) => out.split(k).join("gb_[REDACTED]"), s);
function check(pass: unknown, name: string, evidence: unknown = "") {
  const ev = scrub(
    typeof evidence === "string" ? evidence : JSON.stringify(evidence),
  ).slice(0, 240);
  results.push({ section, name, pass: Boolean(pass), ev });
  console.log(`  ${pass ? "PASS" : "FAIL"} ${name}${ev ? ` — ${ev}` : ""}`);
}
function start(name: string) {
  section = name;
  console.log(`\n== ${name}`);
}

// ---------- HTTP helpers ----------
const withBypass = (h: Record<string, string> = {}) =>
  bypass ? { ...h, "x-vercel-protection-bypass": bypass } : h;

async function http(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: withBypass({
      ...(init.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...init.headers,
    }),
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { res, status: res.status, text, json };
}

type Auth = { key: string; via: "header" | "query" };
type ToolResult = { isError?: boolean; content?: { text: string }[] };

class Mcp {
  sessionId?: string;
  id = 1;
  auth: Auth;
  constructor(auth: Auth) {
    this.auth = auth;
  }
  url() {
    return this.auth.via === "query"
      ? `/api/mcp/mcp?key=${encodeURIComponent(this.auth.key)}`
      : "/api/mcp/mcp";
  }
  async raw(method: string, params: unknown = {}, notify = false) {
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    };
    if (this.auth.via === "header")
      headers.authorization = `Bearer ${this.auth.key}`;
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const r = await http(this.url(), {
      method: "POST",
      headers,
      body: notify
        ? { jsonrpc: "2.0", method, params }
        : { jsonrpc: "2.0", id: this.id++, method, params },
    });
    this.sessionId = r.res.headers.get("mcp-session-id") ?? this.sessionId;
    let msg: Record<string, unknown> | null = r.json;
    if (r.res.headers.get("content-type")?.includes("text/event-stream")) {
      const frames = r.text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => JSON.parse(l.slice(5)));
      msg = frames.at(-1) ?? null;
    }
    return { ...r, msg };
  }
  async init() {
    const r = await this.raw("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "glassbox-security-check", version: "1.0.0" },
    });
    await this.raw("notifications/initialized", {}, true);
    return r;
  }
  async call(name: string, args: unknown) {
    const r = await this.raw("tools/call", { name, arguments: args });
    const result = (r.msg?.result ?? {}) as ToolResult;
    const text = (result.content ?? []).map((c) => c.text).join("\n");
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      // error text
    }
    return {
      status: r.status,
      isError: result.isError === true || Boolean(r.msg?.error),
      text: text || JSON.stringify(r.msg?.error ?? r.text),
      data,
    };
  }
}

// ---------- users ----------
type User = {
  label: string;
  id: string;
  email: string;
  cookie: string;
  db: SupabaseClient; // signed in with the user's own JWT
  key: string;
  keyId: string;
};

async function makeUser(label: string): Promise<User> {
  const email = `sec-${label.toLowerCase()}-${Date.now()}@glassbox.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const jar = new Map<string, string>();
  const ssr = createServerClient(supabaseUrl, publishable, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) =>
        list.forEach(({ name, value }) =>
          value ? jar.set(name, value) : jar.delete(name),
        ),
    },
  });
  const { error: ssrErr } = await ssr.auth.signInWithPassword({
    email,
    password,
  });
  if (ssrErr) throw ssrErr;
  const db = createClient(supabaseUrl, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: dbErr } = await db.auth.signInWithPassword({
    email,
    password,
  });
  if (dbErr) throw dbErr;
  return {
    label,
    id: data.user.id,
    email,
    cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    db,
    key: "",
    keyId: "",
  };
}

async function mintKey(user: User, name: string) {
  const r = await http("/api/agent-keys", {
    method: "POST",
    headers: { cookie: user.cookie, origin: base },
    body: { name },
  });
  const key = String(r.json?.key ?? "");
  if (key) secrets.push(key);
  const { data: row } = await admin
    .from("agent_keys")
    .select("id, key_hash")
    .eq("user_id", user.id)
    .eq("name", name)
    .single();
  return { r, key, row };
}

const ALIGN_ARGS = {
  task: "SECMARK-A Plan a weekend team offsite for 8 people under $2,000.",
  understanding:
    "Find a venue and an agenda for 8 people within budget; booking is out of scope.",
  approach:
    "Shortlist three venues, compare price and travel time, then draft an agenda.",
  priorities: [
    {
      name: "Stay under budget",
      why: "The human set $2,000",
      source: "request",
    },
    { name: "Short travel time", why: "Weekend is short", source: "judgment" },
    { name: "Good food", why: "Team morale", source: "assumption" },
    { name: "Quiet workspace", why: "Planning sessions", source: "judgment" },
  ],
};

const users: User[] = [];
const fakeId = "00000000-0000-4000-8000-000000000000";

try {
  console.log(`Glass Box security check against ${base}`);
  const A = await makeUser("A");
  users.push(A);
  const B = await makeUser("B");
  users.push(B);

  // ================= 4 (part): key minting and storage =================
  start("4. Key handling");
  for (const u of [A, B]) {
    const { r, key, row } = await mintKey(u, `sec-agent-${u.label}`);
    u.key = key;
    u.keyId = row?.id ?? "";
    check(
      r.status === 201 && key.startsWith("gb_"),
      `${u.label}: key minted via /api/agent-keys`,
      `${r.status}`,
    );
    check(
      row?.key_hash === createHash("sha256").update(key).digest("hex") &&
        row.key_hash !== key,
      `${u.label}: only the sha256 hash is stored`,
    );
  }
  const { data: cols } = await admin.from("agent_keys").select("*").limit(1);
  check(
    cols?.[0] &&
      !Object.values(cols[0]).some((v) => String(v).startsWith("gb_")),
    "agent_keys row has no column holding a raw key",
    Object.keys(cols?.[0] ?? {}).join(","),
  );
  const connectPage = await http("/connect", { headers: { cookie: A.cookie } });
  check(
    connectPage.status === 200 && !connectPage.text.includes(A.key),
    "/connect page never re-displays a minted key",
    `${connectPage.status}`,
  );

  for (const [label, headers, path] of [
    ["MCP: no key", {}, "/api/mcp/mcp"],
    [
      "MCP: garbage gb_ key",
      { authorization: "Bearer gb_garbage" },
      "/api/mcp/mcp",
    ],
    [
      "MCP: non-gb bearer",
      { authorization: "Bearer abc.def.ghi" },
      "/api/mcp/mcp",
    ],
    ["MCP: garbage ?key=", {}, "/api/mcp/mcp?key=gb_garbage"],
  ] as const) {
    const r = await http(path, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", ...headers },
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    check(
      r.status === 401 &&
        r.res.headers.get("www-authenticate")?.startsWith("Bearer "),
      `${label} -> 401 + WWW-Authenticate`,
      `${r.status} ${r.res.headers.get("www-authenticate") ?? "(none)"}`,
    );
  }
  for (const [label, path, method] of [
    ["REST POST /api/review", "/api/review", "POST"],
    [
      "REST GET /api/reviews/:id/contract",
      `/api/reviews/${fakeId}/contract`,
      "GET",
    ],
    ["REST GET /api/agent/contract", "/api/agent/contract", "GET"],
  ] as const) {
    const r = await http(path, {
      method,
      headers: { authorization: "Bearer gb_garbage" },
      body: method === "POST" ? { task: "x" } : undefined,
    });
    check(r.status === 401, `${label} with garbage key -> 401`, `${r.status}`);
  }

  // Revoked key: mint a second key for A, revoke it, use it.
  const spare = await mintKey(A, "sec-spare");
  const revoke = await http(`/api/agent-keys/${spare.row?.id}`, {
    method: "DELETE",
    headers: { cookie: A.cookie, origin: base },
  });
  check(revoke.status === 200, "A revokes own spare key", `${revoke.status}`);
  const revokedUse = await http("/api/mcp/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${spare.key}`,
      accept: "application/json, text/event-stream",
    },
    body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  check(
    revokedUse.status === 401 &&
      revokedUse.res.headers.get("www-authenticate")?.startsWith("Bearer "),
    "revoked key -> 401 + WWW-Authenticate",
    `${revokedUse.status}`,
  );
  const revokedRest = await http(`/api/agent/contract`, {
    headers: { authorization: `Bearer ${spare.key}` },
  });
  check(
    revokedRest.status === 401,
    "revoked key on REST -> 401",
    `${revokedRest.status}`,
  );

  // ================= 1. Full MCP flow for A =================
  start("1. Full MCP flow (A, Authorization header)");
  const mcpA = new Mcp({ key: A.key, via: "header" });
  const initA = await mcpA.init();
  const serverInfo = (initA.msg?.result as { serverInfo?: { name: string } })
    ?.serverInfo;
  check(
    initA.status === 200 && serverInfo?.name === "glass-box",
    "initialize",
    `${initA.status} ${serverInfo?.name}`,
  );
  const tools = (
    (
      (await mcpA.raw("tools/list")).msg?.result as {
        tools?: { name: string }[];
      }
    )?.tools ?? []
  ).map((t) => t.name);
  check(
    [
      "align",
      "answer_challenges",
      "get_contract",
      "checkpoint",
      "request_spend",
    ].every((t) => tools.includes(t)),
    "tools/list",
    tools.join(","),
  );

  let reviewA = ""; // approved by the end of section 1
  let reviewA2 = ""; // stays pending (cross-user approve/reject target)
  if (has("--skip-llm")) {
    const ins = async (task: string) =>
      (
        await admin
          .from("reviews")
          .insert({
            user_id: A.id,
            agent_name: "sec",
            task,
            plan: "p",
            critique: {
              challenges: [
                {
                  id: "c1",
                  scenario: "s",
                  tests: ["x", "y"],
                  why_it_matters: "",
                },
              ],
            },
          })
          .select("id")
          .single()
      ).data!.id as string;
    reviewA = await ins("SECMARK-A inserted");
    reviewA2 = await ins("SECMARK-A inserted pending");
    check(true, "align skipped (--skip-llm); reviews inserted with admin");
  } else {
    const t0 = Date.now();
    const aligned = await mcpA.call("align", ALIGN_ARGS);
    reviewA = String(aligned.data.review_id ?? "");
    const challenges = (aligned.data.challenges ?? []) as {
      id: string;
      trade_off: string;
    }[];
    check(
      !aligned.isError &&
        reviewA &&
        aligned.data.status === "answer_challenges" &&
        challenges.length > 0,
      "tools/call align -> answer_challenges",
      `${((Date.now() - t0) / 1000).toFixed(1)}s, ${challenges.length} challenges ${aligned.isError ? aligned.text : ""}`,
    );
    check(
      !("critique" in aligned.data) && !("revealed" in aligned.data),
      "align returns no analysis to the agent",
    );
    const answered = await mcpA.call("answer_challenges", {
      review_id: reviewA,
      answers: challenges.map((c) => ({
        id: c.id,
        response: "I'd pick the cheaper option and tell the human.",
        favors: c.trade_off.split(" vs ")[0] ?? "",
        would_ask_human: false,
      })),
    });
    const alignUrl = String(answered.data.align_url ?? "");
    check(
      !answered.isError &&
        answered.data.status === "pending" &&
        alignUrl === `${base}/align/${reviewA}`,
      "answer_challenges -> pending + align_url on this origin",
      alignUrl || answered.text,
    );
    check(!alignUrl.includes("key="), "align_url does not carry the key");

    // Same flow with ?key= (second review stays pending for section 2).
    start("1b. MCP flow via ?key=");
    const mcpQ = new Mcp({ key: A.key, via: "query" });
    const initQ = await mcpQ.init();
    check(initQ.status === 200, "initialize via ?key=", `${initQ.status}`);
    const alignedQ = await mcpQ.call("align", {
      ...ALIGN_ARGS,
      task: "SECMARK-A2 Pick a laptop for a designer under $1,500.",
    });
    reviewA2 = String(alignedQ.data.review_id ?? "");
    check(
      !alignedQ.isError && reviewA2,
      "align via ?key=",
      alignedQ.isError ? alignedQ.text : reviewA2,
    );
    const qChallenges = (alignedQ.data.challenges ?? []) as {
      id: string;
      trade_off: string;
    }[];
    const answeredQ = await mcpQ.call("answer_challenges", {
      review_id: reviewA2,
      answers: qChallenges.map((c) => ({
        id: c.id,
        response: "Ask first.",
        favors: "ask the human",
        would_ask_human: true,
      })),
    });
    const qUrl = String(answeredQ.data.align_url ?? "");
    check(
      !answeredQ.isError && qUrl === `${base}/align/${reviewA2}`,
      "answer_challenges via ?key=; align_url has no key",
      qUrl.includes("key=") ? "LEAK" : qUrl || answeredQ.text,
    );
    section = "1. Full MCP flow (A, Authorization header)";
  }

  // The human (A) approves in the pop-up.
  const pageA = await http(`/align/${reviewA}`, {
    headers: { cookie: A.cookie },
  });
  check(
    pageA.status === 200 && pageA.text.includes("SECMARK-A"),
    "A's cookie renders /align/<A review>",
    `${pageA.status}`,
  );
  const approveBody = {
    ranked_priorities: ["Stay under budget", "Short travel time"],
    instructions: ["SECMARK-INSTR keep receipts"],
    budget_cents: 1000,
  };
  const noOrigin = await http(`/api/reviews/${reviewA}/approve`, {
    method: "POST",
    headers: { cookie: A.cookie },
    body: approveBody,
  });
  check(
    noOrigin.status === 403,
    "approve without Origin -> 403",
    `${noOrigin.status}`,
  );
  const evilOrigin = await http(`/api/reviews/${reviewA}/approve`, {
    method: "POST",
    headers: { cookie: A.cookie, origin: "https://evil.example" },
    body: approveBody,
  });
  check(
    evilOrigin.status === 403,
    "approve with cross-site Origin -> 403",
    `${evilOrigin.status}`,
  );
  const approved = await http(`/api/reviews/${reviewA}/approve`, {
    method: "POST",
    headers: { cookie: A.cookie, origin: base },
    body: approveBody,
  });
  check(
    approved.status === 200,
    "A approves (cookie + same origin)",
    `${approved.status} ${approved.json?.error ?? ""}`,
  );
  const contractA = await mcpA.call("get_contract", { review_id: reviewA });
  const contract = contractA.data.contract as
    { instructions_from_human?: string[]; budget_cents?: number } | undefined;
  check(
    !contractA.isError &&
      contractA.data.status === "approved" &&
      contract?.instructions_from_human?.[0] === "SECMARK-INSTR keep receipts",
    "get_contract -> approved contract with the human's instructions",
    contractA.isError ? contractA.text : `${contractA.data.status}`,
  );
  const cpA = await mcpA.call("checkpoint", {
    review_id: reviewA,
    action: "fetch",
    target: "https://example.com/venues",
  });
  check(
    !cpA.isError && cpA.data.decision,
    "checkpoint (A, own review)",
    `${cpA.data.decision}`,
  );
  const spendA = await mcpA.call("request_spend", {
    review_id: reviewA,
    amount_cents: 100,
    purpose: "SECMARK deposit",
  });
  check(
    !spendA.isError && typeof spendA.data.allowed === "boolean",
    "request_spend (A, own review)",
    `allowed=${spendA.data.allowed} stripe=${spendA.data.stripe}`,
  );
  const qContract = await new Mcp({ key: A.key, via: "query" }).call(
    "get_contract",
    { review_id: reviewA },
  );
  check(
    qContract.data.status === "approved",
    "get_contract via ?key= -> approved",
    `${qContract.data.status ?? qContract.text}`,
  );

  // ================= 2. Cross-user isolation =================
  start("2. Cross-user isolation (B vs A's reviews)");
  const leaks = (s: string) =>
    /SECMARK/.test(s) || s.includes(A.id) || s.includes(A.email);
  const mcpB = new Mcp({ key: B.key, via: "header" });
  await mcpB.init();
  for (const [tool, argsFor] of [
    ["get_contract", (id: string) => ({ review_id: id })],
    [
      "answer_challenges",
      (id: string) => ({
        review_id: id,
        answers: [
          { id: "c1", response: "x", favors: "x", would_ask_human: false },
        ],
      }),
    ],
    [
      "checkpoint",
      (id: string) => ({ review_id: id, action: "fetch", target: "x" }),
    ],
    [
      "request_spend",
      (id: string) => ({ review_id: id, amount_cents: 100, purpose: "x" }),
    ],
  ] as const) {
    for (const id of [reviewA, reviewA2]) {
      const t0 = Date.now();
      const r = await mcpB.call(tool, argsFor(id));
      check(
        r.isError && /not found/i.test(r.text) && !leaks(r.text),
        `B's key: ${tool} on A's ${id === reviewA ? "approved" : "pending"} review -> error, no data`,
        `${r.text.slice(0, 80)} (${Date.now() - t0}ms)`,
      );
    }
  }
  const bKeyHdr = { authorization: `Bearer ${B.key}` };
  for (const [label, path, method, body] of [
    ["GET contract", `/api/reviews/${reviewA}/contract`, "GET", undefined],
    [
      "POST answers",
      `/api/reviews/${reviewA2}/answers`,
      "POST",
      {
        answers: [
          { id: "c1", response: "x", favors: "x", would_ask_human: false },
        ],
      },
    ],
    [
      "POST checkpoint",
      `/api/reviews/${reviewA}/checkpoint`,
      "POST",
      { action: "fetch", target: "x" },
    ],
  ] as const) {
    const r = await http(path, { method, headers: bKeyHdr, body });
    check(
      r.status === 404 && !leaks(r.text),
      `B's key REST ${label} on A's review -> 404`,
      `${r.status} ${r.text.slice(0, 80)}`,
    );
  }
  const bLatest = await http("/api/agent/contract", { headers: bKeyHdr });
  check(
    bLatest.json?.status === "none" && !leaks(bLatest.text),
    "B's key GET /api/agent/contract sees none of A's reviews",
    bLatest.text.slice(0, 80),
  );

  const bPage = await http(`/align/${reviewA}`, {
    headers: { cookie: B.cookie },
  });
  check(
    bPage.status === 404 && !leaks(bPage.text),
    "B's cookie GET /align/<A's review> -> 404, no content",
    `${bPage.status}`,
  );
  const bPage2 = await http(`/align/${reviewA2}`, {
    headers: { cookie: B.cookie },
  });
  check(
    bPage2.status === 404 && !leaks(bPage2.text),
    "B's cookie GET /align/<A's pending review> -> 404",
    `${bPage2.status}`,
  );
  const anonPage = await http(`/align/${reviewA}`);
  check(
    !leaks(anonPage.text),
    "signed-out GET /align/<A's review> shows sign-in only",
    `${anonPage.status}`,
  );
  for (const action of ["approve", "reject"]) {
    const r = await http(`/api/reviews/${reviewA2}/${action}`, {
      method: "POST",
      headers: { cookie: B.cookie, origin: base },
      body: { ranked_priorities: ["B wins"] },
    });
    check(
      r.status >= 400 && r.status < 500 && !leaks(r.text),
      `B's cookie POST ${action} on A's pending review -> fails`,
      `${r.status} ${r.text.slice(0, 80)}`,
    );
  }
  const badId = await http(`/api/reviews/not-a-uuid/reject`, {
    method: "POST",
    headers: { cookie: B.cookie, origin: base },
  });
  check(
    badId.status === 404 && !/syntax|uuid|postgres/i.test(badId.text),
    "reject with a malformed id -> 404 without DB error text",
    `${badId.status} ${badId.text.slice(0, 80)}`,
  );
  const { data: a2 } = await admin
    .from("reviews")
    .select("status")
    .eq("id", reviewA2)
    .single();
  check(
    a2?.status === "pending",
    "A's pending review is still pending",
    a2?.status,
  );
  const bRevoke = await http(`/api/agent-keys/${A.keyId}`, {
    method: "DELETE",
    headers: { cookie: B.cookie, origin: base },
  });
  check(
    bRevoke.status === 404,
    "B revoking A's key -> 404",
    `${bRevoke.status}`,
  );
  const aStill = await http("/api/agent/contract", {
    headers: { authorization: `Bearer ${A.key}` },
  });
  check(
    aStill.status === 200,
    "A's key still works after B's attempt",
    `${aStill.status}`,
  );
  const bCookieOnMcp = await http("/api/mcp/mcp", {
    method: "POST",
    headers: {
      cookie: B.cookie,
      accept: "application/json, text/event-stream",
    },
    body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  });
  check(
    bCookieOnMcp.status === 401,
    "session cookie alone is not accepted by the MCP endpoint",
    `${bCookieOnMcp.status}`,
  );

  // ================= 3. Direct Supabase =================
  if (!has("--skip-db")) {
    start("3. Direct Supabase (publishable key and B's JWT)");
    const anon = createClient(supabaseUrl, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const tables = [
      "reviews",
      "contracts",
      "events",
      "agent_keys",
      "spends",
      "profiles",
    ] as const;
    // Make sure A has a row in every table first.
    await A.db.rpc("save_profile", {
      p_ranked_priorities: ["SECMARK-profile"],
      p_dials: {},
      p_hard_lines: {},
      p_budget_cents: 1234,
    });
    for (const t of tables) {
      const { count } = await admin
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("user_id", A.id);
      const own = await A.db.from(t).select("*").eq("user_id", A.id);
      const viaAnon = await anon.from(t).select("*").limit(5);
      const viaB = await B.db.from(t).select("*").eq("user_id", A.id);
      check(
        (count ?? 0) > 0 && (own.data?.length ?? 0) > 0,
        `${t}: A has rows and can read them (control)`,
        `admin=${count} A=${own.data?.length}`,
      );
      check(
        !viaAnon.data?.length,
        `${t}: publishable key reads nothing`,
        viaAnon.error?.message ?? `${viaAnon.data?.length} rows`,
      );
      check(
        !viaB.data?.length,
        `${t}: B's JWT reads none of A's rows`,
        viaB.error?.message ?? `${viaB.data?.length} rows`,
      );
      const upd = await B.db
        .from(t)
        .update({ user_id: B.id })
        .eq("user_id", A.id)
        .select();
      check(
        !upd.data?.length,
        `${t}: B's JWT cannot update A's rows`,
        upd.error?.message ?? `${upd.data?.length} rows`,
      );
      const del = await B.db.from(t).delete().eq("user_id", A.id).select();
      check(
        !del.data?.length,
        `${t}: B's JWT cannot delete A's rows`,
        del.error?.message ?? `${del.data?.length} rows`,
      );
      const anonUpd = await anon
        .from(t)
        .update({ user_id: B.id })
        .eq("user_id", A.id)
        .select();
      check(
        !anonUpd.data?.length,
        `${t}: publishable key cannot update`,
        anonUpd.error?.message ?? `${anonUpd.data?.length} rows`,
      );
    }
    const insertRows: Record<string, Record<string, unknown>> = {
      reviews: { user_id: A.id, agent_name: "x", task: "x", plan: "x" },
      contracts: {
        review_id: reviewA2,
        user_id: A.id,
        ranked_priorities: [],
        dials: {},
        hard_lines: {},
        budget_cents: 999999,
      },
      events: {
        review_id: reviewA,
        user_id: A.id,
        type: "approval",
        action: "forged",
      },
      agent_keys: { user_id: A.id, name: "forged", key_hash: "forged" },
      spends: {
        review_id: reviewA,
        user_id: A.id,
        amount_cents: 1,
        purpose: "forged",
      },
      profiles: { user_id: A.id, budget_cents: 999999 },
    };
    for (const t of tables) {
      for (const [who, client] of [
        ["B's JWT", B.db],
        ["publishable key", anon],
      ] as const) {
        const ins = await client.from(t).insert(insertRows[t]).select();
        check(
          Boolean(ins.error) && !ins.data?.length,
          `${t}: ${who} cannot insert a row for A`,
          ins.error?.message ?? "INSERTED",
        );
      }
      const own = { ...insertRows[t], user_id: B.id };
      const ownIns = await B.db.from(t).insert(own).select();
      check(
        Boolean(ownIns.error),
        `${t}: B's JWT cannot insert directly even for itself (writes go through server/RPC)`,
        ownIns.error?.message ?? "INSERTED",
      );
    }

    const approveArgs = {
      p_review_id: reviewA2,
      p_ranked_priorities: ["B"],
      p_dials: {},
      p_hard_lines: {},
      p_budget_cents: 999999,
      p_plan_guidance: "x",
      p_notes: "x",
    };
    for (const [who, client] of [
      ["B's JWT", B.db],
      ["publishable key", anon],
    ] as const) {
      const ap = await client.rpc("approve_review", approveArgs);
      check(
        ap.error,
        `RPC approve_review(A's review) as ${who} fails`,
        ap.error?.message,
      );
      const rj = await client.rpc("reject_review", { p_review_id: reviewA2 });
      check(
        rj.error,
        `RPC reject_review(A's review) as ${who} fails`,
        rj.error?.message,
      );
      const sp = await client.rpc("request_spend", {
        p_review_id: reviewA,
        p_amount_cents: 100,
        p_purpose: "forged",
      });
      check(
        sp.error,
        `RPC request_spend(A's review) as ${who} fails`,
        sp.error?.message,
      );
      const rw = await client.rpc("reserve_workflow", {
        p_user_id: A.id,
        p_input: "forged workflow input",
        p_model: "x",
      });
      check(
        /permission denied/.test(rw.error?.message ?? ""),
        `RPC reserve_workflow(A) as ${who} denied`,
        rw.error?.message,
      );
      const ss = await client.rpc("sync_subscription", {
        p_event_id: "evt_forged",
        p_event_created: 1,
        p_customer_id: "cus_forged",
        p_subscription_id: "sub_forged",
        p_status: "active",
        p_price_id: "price_forged",
        p_period_end: new Date().toISOString(),
        p_cancel_at_period_end: false,
      });
      check(
        /permission denied/.test(ss.error?.message ?? ""),
        `RPC sync_subscription as ${who} denied`,
        ss.error?.message,
      );
    }
    const anonSave = await anon.rpc("save_profile", {
      p_ranked_priorities: [],
      p_dials: {},
      p_hard_lines: {},
      p_budget_cents: 1,
    });
    check(
      anonSave.error,
      "RPC save_profile as publishable key fails",
      anonSave.error?.message,
    );
    await B.db.rpc("save_profile", {
      p_ranked_priorities: ["B"],
      p_dials: {},
      p_hard_lines: {},
      p_budget_cents: 1,
    });
    const { data: aProfile } = await admin
      .from("profiles")
      .select("budget_cents")
      .eq("user_id", A.id)
      .single();
    check(
      aProfile?.budget_cents === 1234,
      "RPC save_profile as B only touches B's profile",
      `${aProfile?.budget_cents}`,
    );
    const { data: a2After } = await admin
      .from("reviews")
      .select("status")
      .eq("id", reviewA2)
      .single();
    check(
      a2After?.status === "pending",
      "A's pending review untouched after RPC attempts",
      a2After?.status,
    );

    start("3b. Realtime");
    const seen = { A: 0, B: 0 };
    const subscribe = (u: User, label: "A" | "B") =>
      new Promise<() => Promise<void>>((resolve, reject) => {
        // supabase-js passes the signed-in user's JWT to Realtime.
        const ch = u.db
          .channel(`sec-${label}-${Date.now()}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "reviews" },
            () => seen[label]++,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "events" },
            () => seen[label]++,
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED")
              resolve(async () => {
                await u.db.removeChannel(ch);
              });
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
              reject(new Error(`realtime ${label}: ${status}`));
          });
      });
    try {
      const [unsubA, unsubB] = await Promise.all([
        subscribe(A, "A"),
        subscribe(B, "B"),
      ]);
      await new Promise((r) => setTimeout(r, 1500));
      await admin
        .from("reviews")
        .update({ agent_name: "sec-realtime" })
        .eq("id", reviewA2);
      await admin.from("events").insert({
        review_id: reviewA,
        user_id: A.id,
        type: "drift",
        action: "SECMARK rt",
      });
      await new Promise((r) => setTimeout(r, 5000));
      check(
        seen.A > 0,
        "A's subscription receives A's changes (control)",
        `${seen.A}`,
      );
      check(
        seen.B === 0,
        "B's subscription receives none of A's changes",
        `${seen.B}`,
      );
      await unsubA();
      await unsubB();
    } catch (e) {
      check(false, "Realtime subscription", (e as Error).message);
    }
  }

  // ================= 5. Abuse basics =================
  start("5. Abuse basics");
  const big = await mcpA.call("align", {
    ...ALIGN_ARGS,
    task: "x".repeat(4001),
  });
  check(big.isError, "align task > 4000 chars rejected", big.text.slice(0, 80));
  const many = await mcpA.call("align", {
    ...ALIGN_ARGS,
    priorities: Array.from({ length: 13 }, (_, i) => ({
      name: `p${i}`,
      why: "w",
    })),
  });
  check(many.isError, "align > 12 priorities rejected", many.text.slice(0, 80));
  const restBig = await http("/api/review", {
    method: "POST",
    headers: { authorization: `Bearer ${A.key}` },
    body: { task: "x".repeat(4001) },
  });
  check(
    restBig.status === 400,
    "REST /api/review task > 4000 -> 400",
    `${restBig.status}`,
  );
  const restHuge = await http("/api/review", {
    method: "POST",
    headers: { authorization: `Bearer ${A.key}` },
    body: { task: "x", plan: "y".repeat(20_000) },
  });
  check(
    restHuge.status === 413,
    "REST body > 16KB -> 413",
    `${restHuge.status}`,
  );
  const pre = await http(`/api/reviews/${reviewA2}/approve`, {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  const acao = pre.res.headers.get("access-control-allow-origin");
  check(
    !acao || (acao !== "*" && acao !== "https://evil.example"),
    "approve route has no CORS grant for other origins",
    `${pre.status} ACAO=${acao ?? "(none)"}`,
  );
  const mcpPre = await http("/api/mcp/mcp", {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
    },
  });
  check(
    mcpPre.res.headers.get("access-control-allow-credentials") !== "true",
    "MCP CORS is `*` without credentials (cookies never sent cross-site)",
    `ACAO=${mcpPre.res.headers.get("access-control-allow-origin")} ACAC=${mcpPre.res.headers.get("access-control-allow-credentials") ?? "(none)"}`,
  );

  // Rate limit: fill B's hour with reviews (admin), then align must refuse before any LLM call.
  const filler = Array.from({ length: 60 }, (_, i) => ({
    user_id: B.id,
    agent_name: "sec-filler",
    task: `filler ${i}`,
    plan: "p",
  }));
  await admin.from("reviews").insert(filler);
  const t0 = Date.now();
  const limited = await mcpB.call("align", ALIGN_ARGS);
  check(
    limited.isError && /limit|too many/i.test(limited.text),
    "align is rate-limited per user (60 reviews in the last hour)",
    `${limited.text.slice(0, 100)} (${Date.now() - t0}ms)`,
  );
  const limitedRest = await http("/api/review", {
    method: "POST",
    headers: { authorization: `Bearer ${B.key}` },
    body: { task: "x" },
  });
  check(
    limitedRest.status === 429,
    "REST /api/review rate-limited -> 429",
    `${limitedRest.status}`,
  );
} catch (error) {
  check(false, "script error", (error as Error).stack ?? String(error));
} finally {
  for (const u of users) {
    await u.db.auth.signOut().catch(() => {});
    const { error } = await admin.auth.admin.deleteUser(u.id);
    console.log(
      `\n(deleted throwaway user ${u.label}${error ? `: ${error.message}` : ""})`,
    );
  }
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
for (const f of failed)
  console.log(`  FAIL [${f.section}] ${f.name} — ${f.ev}`);
process.exitCode = failed.length ? 1 : 0;
