import "server-only";
import { z } from "zod";

export class ConfigurationError extends Error {
  constructor(public variable: string) {
    super(`Missing environment variable: ${variable}`);
    this.name = "ConfigurationError";
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value === "[SENSITIVE]") throw new ConfigurationError(name);
  return value;
}

const vercelOrigin = (host: string | undefined) =>
  host?.trim() ? `https://${host.trim()}` : undefined;

// The public origin used in emailed links, Stripe redirects and align_urls.
// APP_URL wins. Without it, a Vercel deployment falls back to its own stable
// origin (production domain, else the branch alias, else the deployment URL),
// so a deployed build never hands agents a localhost link.
export function appUrl(): string {
  const raw =
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_ENV === "production"
      ? vercelOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
      : undefined) ||
    vercelOrigin(process.env.VERCEL_BRANCH_URL) ||
    vercelOrigin(process.env.VERCEL_URL);
  if (!raw) throw new Error("Missing environment variable: APP_URL");
  const url = new URL(z.url().parse(raw));
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("APP_URL must use HTTP(S)");
  return url.origin;
}

// Origins allowed to POST to cookie-authenticated JSON routes: APP_URL plus
// this Vercel deployment's own hostnames (a preview is reachable at several).
export function trustedOrigins(): Set<string> {
  return new Set(
    [
      appUrl(),
      vercelOrigin(process.env.VERCEL_URL),
      vercelOrigin(process.env.VERCEL_BRANCH_URL),
    ].filter((origin): origin is string => Boolean(origin)),
  );
}

export function requireSubscription(): boolean {
  return (
    z
      .enum(["true", "false"])
      .parse(process.env.AI_REQUIRE_SUBSCRIPTION ?? "false") === "true"
  );
}
