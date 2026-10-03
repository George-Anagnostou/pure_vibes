import { describe, expect, it } from "vitest";
import { canonicalRedirectUrl } from "@/lib/canonical-host";

const prod = { VERCEL_ENV: "production", APP_URL: "https://app.example" };
const get = (url: string, method = "GET") => ({
  method,
  url,
  headers: new Headers({ host: new URL(url).host }),
});

describe("canonical production host", () => {
  it("sends pages on another production host to APP_URL, keeping path and query", () => {
    expect(
      canonicalRedirectUrl(
        get("https://deploy-abc.vercel.app/sign-in?next=%2Fconnect"),
        prod,
      )?.href,
    ).toBe("https://app.example/sign-in?next=%2Fconnect");
    expect(
      canonicalRedirectUrl(get("https://team-alias.vercel.app/", "HEAD"), prod)
        ?.href,
    ).toBe("https://app.example/");
  });

  it("trusts the Host header over the server's own request.url host", () => {
    const behindProxy = {
      method: "GET",
      url: "http://localhost:3000/sign-in",
      headers: new Headers({ "x-forwarded-host": "app.example" }),
    };
    expect(canonicalRedirectUrl(behindProxy, prod)).toBeNull();
  });

  it.each([
    ["already canonical", get("https://app.example/sign-in"), prod],
    [
      "API (MCP, agents)",
      get("https://deploy-abc.vercel.app/api/mcp/mcp"),
      prod,
    ],
    [
      "auth link in flight",
      get("https://deploy-abc.vercel.app/auth/callback?code=x"),
      prod,
    ],
    ["POST", get("https://deploy-abc.vercel.app/sign-in", "POST"), prod],
    [
      "preview build",
      get("https://deploy-abc.vercel.app/"),
      { ...prod, VERCEL_ENV: "preview" },
    ],
    [
      "local dev",
      get("http://localhost:3000/"),
      { APP_URL: "http://localhost:3000" },
    ],
    [
      "missing APP_URL",
      get("https://deploy-abc.vercel.app/"),
      { VERCEL_ENV: "production" },
    ],
    [
      "non-https APP_URL",
      get("https://deploy-abc.vercel.app/"),
      { VERCEL_ENV: "production", APP_URL: "http://app.example" },
    ],
  ])("leaves %s alone", (_label, request, env) => {
    expect(canonicalRedirectUrl(request, env)).toBeNull();
  });
});
