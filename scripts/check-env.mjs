const groups = {
  app: ["APP_URL"],
  supabase: [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
  ],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"],
  ai: ["OPENAI_API_KEY", "AI_MODEL"],
};

let valid = true;
for (const [group, keys] of Object.entries(groups)) {
  const missing = keys.filter(
    (key) =>
      !process.env[key]?.trim() || process.env[key]?.trim() === "[SENSITIVE]",
  );
  console.log(
    `${group}: ${missing.length ? `missing ${missing.join(", ")}` : "variables present (connectivity not tested)"}`,
  );
  if (missing.length) valid = false;
}
for (const key of ["APP_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  try {
    const url = new URL(process.env[key]);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    console.error(`${key}: must be an absolute HTTP(S) URL`);
    valid = false;
  }
}
if (
  ![undefined, "false", "true"].includes(process.env.AI_REQUIRE_SUBSCRIPTION)
) {
  console.error("AI_REQUIRE_SUBSCRIPTION: must be true or false");
  valid = false;
}
process.exitCode = valid ? 0 : 1;
