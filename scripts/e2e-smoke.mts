// End-to-end smoke test against a running app + the linked Supabase project.
// Usage (app running on GLASSBOX_URL, default http://localhost:3000):
//   npx tsx --env-file=.env.local scripts/e2e-smoke.mts
// Creates a throwaway user + agent key, runs the Beat 2 flow
// (agent key -> review -> approve -> contract -> checkpoint), checks the events log, then deletes the user.
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { QUIZ_PLAN } from "../fixtures/demo-plans.ts";

const base = (process.env.GLASSBOX_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

function step(name: string) {
  console.log(`\n== ${name}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

const email = `e2e-${Date.now()}@glassbox.test`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) throw createErr;
const userId = created.user.id;

try {
  step("Session cookie for the human");
  const jar = new Map<string, string>();
  const ssr = createServerClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) =>
          list.forEach(({ name, value }) =>
            value ? jar.set(name, value) : jar.delete(name),
          ),
      },
    },
  );
  const { error: signInErr } = await ssr.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw signInErr;
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  assert(cookie.length > 0, "signed in, session cookie captured");

  step("Mint agent key via /api/agent-keys");
  const keyRes = await fetch(`${base}/api/agent-keys`, {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({ name: "e2e-quiz-agent" }),
  });
  const keyBody = await keyRes.json();
  assert(
    keyRes.status === 201 && keyBody.key?.startsWith("gb_"),
    `agent key minted (${keyRes.status})`,
  );
  const agentHeaders = {
    authorization: `Bearer ${keyBody.key}`,
    "content-type": "application/json",
  };
  const { data: keyRow } = await admin
    .from("agent_keys")
    .select("key_hash")
    .eq("user_id", userId)
    .single();
  assert(
    keyRow?.key_hash === createHash("sha256").update(keyBody.key).digest("hex"),
    "only the hash is stored",
  );

  step("Agent submits the quiz plan (Reveal + Critique)");
  const t0 = Date.now();
  const revRes = await fetch(`${base}/api/review`, {
    method: "POST",
    headers: agentHeaders,
    body: JSON.stringify(QUIZ_PLAN),
  });
  const review = await revRes.json();
  assert(
    revRes.status === 201,
    `review created in ${((Date.now() - t0) / 1000).toFixed(1)}s (${revRes.status} ${review.error ?? ""})`,
  );
  console.log(`  headline: ${review.revealed.headline}`);
  console.log(
    `  verdict: ${review.critique.verdict} | risks: ${review.critique.hard_line_risks.map((r: { hard_line: string; severity: string }) => `${r.hard_line}/${r.severity}`).join(", ")}`,
  );
  assert(
    review.critique.verdict !== "green",
    "critique flags the answer-key step",
  );

  step("Contract is pending before approval");
  const pend = await (
    await fetch(`${base}/api/reviews/${review.review_id}/contract`, {
      headers: agentHeaders,
    })
  ).json();
  assert(pend.status === "pending", "contract status pending");

  step("Wrong agent key cannot read the review");
  const bad = await fetch(`${base}/api/reviews/${review.review_id}/contract`, {
    headers: { authorization: "Bearer gb_nope" },
  });
  assert(bad.status === 401, `unknown key rejected (${bad.status})`);

  step("Human approves with a $20 budget");
  const ranked = (review.revealed.priorities as { name: string }[]).map(
    (p) => p.name,
  );
  const t1 = Date.now();
  const apRes = await fetch(`${base}/api/reviews/${review.review_id}/approve`, {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      ranked_priorities: ranked.reverse(),
      dials: review.revealed.dials,
      hard_lines: {
        no_unauthorized_access: true,
        no_deception: true,
        budget_cap: true,
        no_unapproved_contact: true,
      },
      budget_cents: 2000,
      notes: "Do it honestly.",
    }),
  });
  const ap = await apRes.json();
  assert(
    apRes.status === 200,
    `approved in ${((Date.now() - t1) / 1000).toFixed(1)}s (${apRes.status} ${ap.error ?? ""})`,
  );
  console.log(`  guidance: ${String(ap.plan_guidance).slice(0, 200)}...`);

  const again = await fetch(`${base}/api/reviews/${review.review_id}/approve`, {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      ranked_priorities: ["x"],
      dials: review.revealed.dials,
      hard_lines: {},
      budget_cents: 0,
    }),
  });
  assert(again.status === 409, `double-approve rejected (${again.status})`);

  step("Agent gets the contract");
  const c = await (
    await fetch(`${base}/api/reviews/${review.review_id}/contract`, {
      headers: agentHeaders,
    })
  ).json();
  assert(c.status === "approved", "contract approved");
  assert(
    c.contract.hard_lines.includes("budget_max_cents:2000"),
    `hard lines: ${c.contract.hard_lines.join(", ")}`,
  );

  step("Checkpoints");
  const cp = async (body: object) =>
    (
      await fetch(`${base}/api/reviews/${review.review_id}/checkpoint`, {
        method: "POST",
        headers: agentHeaders,
        body: JSON.stringify(body),
      })
    ).json();
  const blocked = await cp({
    action: "fetch",
    target: "/mock/answer-key",
    details: { restricted: true },
  });
  assert(
    blocked.decision === "block",
    `answer key -> ${blocked.decision}: ${blocked.reason}`,
  );
  const fine = await cp({ action: "fetch", target: "/mock/quiz" });
  assert(
    fine.decision === "allow",
    `quiz page -> ${fine.decision}: ${fine.reason}`,
  );

  step("Events landed for the dashboard");
  const { data: events } = await admin
    .from("events")
    .select("type, action")
    .eq("review_id", review.review_id)
    .order("created_at");
  console.log(`  ${events?.map((e) => e.type).join(", ")}`);
  assert(
    events?.some((e) => e.type === "breach") &&
      events.some((e) => e.type === "checkpoint_ok"),
    "breach + checkpoint_ok events logged",
  );
} finally {
  await admin.auth.admin.deleteUser(userId);
  console.log(`\n(cleaned up test user ${email})`);
}
