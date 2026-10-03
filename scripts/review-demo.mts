// Usage: pnpm tsx scripts/review-demo.ts [wine|quiz]  — POSTs a demo plan to /api/review
import { WINE_PLAN, QUIZ_PLAN } from "../fixtures/demo-plans.ts";
const base = process.env.GLASSBOX_URL ?? "http://localhost:3000";
const which = process.argv[2] === "quiz" ? QUIZ_PLAN : WINE_PLAN;
const r = await fetch(`${base}/api/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(which) });
console.log(JSON.stringify(await r.json(), null, 2));
