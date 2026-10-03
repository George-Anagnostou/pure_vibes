// Usage: GLASSBOX_AGENT_KEY=gb_... npx tsx scripts/review-demo.mts [wine|quiz]
// POSTs a demo plan to /api/review and prints Reveal + Critique.
import { WINE_PLAN, QUIZ_PLAN } from "../fixtures/demo-plans.ts";
const base = process.env.GLASSBOX_URL ?? "http://localhost:3000";
const which = process.argv[2] === "quiz" ? QUIZ_PLAN : WINE_PLAN;
const r = await fetch(`${base}/api/review`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.GLASSBOX_AGENT_KEY ?? ""}`,
  },
  body: JSON.stringify(which),
});
console.log(r.status, JSON.stringify(await r.json(), null, 2));
