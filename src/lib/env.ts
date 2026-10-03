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

export function appUrl(): string {
  const url = new URL(z.url().parse(requiredEnv("APP_URL")));
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("APP_URL must use HTTP(S)");
  return url.origin;
}

export function requireSubscription(): boolean {
  return (
    z
      .enum(["true", "false"])
      .parse(process.env.AI_REQUIRE_SUBSCRIPTION ?? "false") === "true"
  );
}
