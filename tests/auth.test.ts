import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { safeNextPath, AUTH_NEXT_COOKIE } from "@/lib/auth-navigation";
import { POST as send } from "@/app/api/auth/sign-in/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { GET as callback } from "@/app/auth/callback/route";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  cookies: new Map<string, { value: string }>(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: mocks }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => mocks.cookies.get(name) }),
}));
function request(
  path: string,
  body: unknown,
  origin = "https://glassbox.example",
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://glassbox.example");
  vi.stubEnv("VERCEL_BRANCH_URL", "preview.example");
  vi.clearAllMocks();
  mocks.cookies.clear();
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("safe auth destinations", () => {
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\nevil.test",
    "/auth/callback",
    "/sign-in",
    "/x/../sign-in",
    undefined,
  ])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBe("/account");
  });
  it("preserves internal paths, queries and fragments", () => {
    expect(safeNextPath("/connect?step=1#key")).toBe("/connect?step=1#key");
  });
});
it("requests the link on the trusted requesting host and saves the continuation", async () => {
  const res = await send(
    request(
      "/api/auth/sign-in",
      { email: "person@example.com", next: "/connect" },
      "https://preview.example",
    ),
  );
  expect(res.status).toBe(200);
  expect(mocks.signInWithOtp).toHaveBeenCalledWith({
    email: "person@example.com",
    options: { emailRedirectTo: "https://preview.example/auth/callback" },
  });
  expect(res.headers.get("set-cookie")).toContain(AUTH_NEXT_COOKIE);
  expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  expect(res.headers.get("cache-control")).toContain("no-store");
});
it("rejects cross-origin email requests before contacting Supabase", async () => {
  expect(
    (
      await send(
        request(
          "/api/auth/sign-in",
          { email: "person@example.com" },
          "https://evil.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(mocks.signInWithOtp).not.toHaveBeenCalled();
});
it("keeps provider errors private and distinguishes delivery errors from rate limits", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.signInWithOtp.mockResolvedValueOnce({
    error: {
      status: 422,
      code: "email_address_not_authorized",
      message: "private provider details",
    },
  });
  const res = await send(
    request("/api/auth/sign-in", { email: "person@example.com" }),
  );
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain("private provider");
  mocks.signInWithOtp.mockResolvedValueOnce({
    error: { status: 429, code: "over_email_send_rate_limit" },
  });
  expect(
    (await send(request("/api/auth/sign-in", { email: "person@example.com" })))
      .status,
  ).toBe(429);
  vi.restoreAllMocks();
});
it("verifies a code through Supabase and returns the validated continuation", async () => {
  const res = await verify(
    request("/api/auth/verify", {
      email: "person@example.com",
      token: "12345678",
      next: "//evil.test",
    }),
  );
  expect(mocks.verifyOtp).toHaveBeenCalledWith({
    email: "person@example.com",
    token: "12345678",
    type: "email",
  });
  expect(await res.json()).toEqual({ next: "/account" });
  expect(res.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
});
it("does not grant a session for an invalid or used code", async () => {
  mocks.verifyOtp.mockResolvedValueOnce({ error: { status: 403 } });
  const res = await verify(
    request("/api/auth/verify", {
      email: "person@example.com",
      token: "123456",
    }),
  );
  expect(res.status).toBe(400);
  expect(await res.json()).not.toHaveProperty("next");
});
it("rejects cross-origin token verification and unsupported OTP types", async () => {
  expect(
    (
      await verify(
        request(
          "/api/auth/verify",
          { token_hash: "test", type: "email" },
          "https://evil.test",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await verify(
        request("/api/auth/verify", { token_hash: "test", type: "recovery" }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
});
it("does not consume token-hash links on GET, including a mail scanner visit", async () => {
  const res = await callback(
    new Request(
      "https://glassbox.example/auth/callback?token_hash=test&type=email",
    ),
  );
  expect(res.headers.get("location")).toContain(
    "/auth/confirm?token_hash=test&type=email",
  );
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
});
it("verifies token hashes only through the confirmation POST", async () => {
  mocks.cookies.set(AUTH_NEXT_COOKIE, { value: "/connect" });
  const res = await verify(
    request("/api/auth/verify", { token_hash: "test", type: "email" }),
  );
  expect(mocks.verifyOtp).toHaveBeenCalledWith({
    token_hash: "test",
    type: "email",
  });
  expect(await res.json()).toEqual({ next: "/connect" });
});
it("exchanges legacy PKCE codes on their originating host", async () => {
  mocks.cookies.set(AUTH_NEXT_COOKIE, { value: "/inbox" });
  const res = await callback(
    new Request("https://preview.example/auth/callback?code=test"),
  );
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test");
  expect(res.headers.get("location")).toBe("https://preview.example/inbox");
});
it("offers recovery when a PKCE link loses its original browser verifier", async () => {
  mocks.exchangeCodeForSession.mockResolvedValueOnce({
    error: { code: "bad_code_verifier" },
  });
  const res = await callback(
    new Request(
      "https://glassbox.example/auth/callback?code=test&next=/connect",
    ),
  );
  const location = new URL(res.headers.get("location")!);
  expect(location.pathname).toBe("/sign-in");
  expect(location.searchParams.get("next")).toBe("/connect");
});
