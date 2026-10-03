import { spawnSync } from "node:child_process";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key || key === "[SENSITIVE]") {
  console.error("Set this project's STRIPE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

const result = spawnSync("stripe", process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, STRIPE_API_KEY: key },
});
if (result.error)
  console.error("Stripe CLI could not start. Check that it is installed.");
process.exit(result.status ?? 1);
