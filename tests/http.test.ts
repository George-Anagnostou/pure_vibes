import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import Stripe from "stripe";
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  MAX_BODY_BYTES,
  readJson,
} from "@/lib/http";

afterEach(() => vi.unstubAllEnvs());

describe("request boundaries", () => {
  it("logs Stripe diagnostic codes without logging provider messages or credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(
      new Stripe.errors.StripeAuthenticationError({
        message: "Invalid key sk_test_private",
        code: "api_key_expired",
        requestId: "req_test",
        statusCode: 401,
      }),
    );
    expect(log).toHaveBeenCalledWith(
      "request_failed",
      expect.objectContaining({
        type: "StripeAuthenticationError",
        providerCode: "api_key_expired",
        providerRequestId: "req_test",
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk_test_private");
    expect(await response.text()).not.toContain("api_key_expired");
    log.mockRestore();
  });

  it("rejects foreign or absent origins even with a forged Host header", () => {
    vi.stubEnv("APP_URL", "https://app.example.com");
    for (const origin of [
      undefined,
      "https://evil.example.com",
      "https://app.example.com.evil.com",
    ]) {
      const request = new Request(
        "https://app.example.com/api/billing/checkout",
        { headers: { host: "app.example.com", ...(origin ? { origin } : {}) } },
      );
      expect(() => assertSameOrigin(request)).toThrow(HttpError);
    }
    expect(() =>
      assertSameOrigin(
        new Request("https://app.example.com", {
          headers: { origin: "https://app.example.com" },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects oversized bodies even without Content-Length", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(MAX_BODY_BYTES + 1) }),
    });
    await expect(readJson(request, z.unknown())).rejects.toMatchObject({
      status: 413,
    });
  });

  it("accepts realistic large payloads (a 15,000-char plan plus decisions)", async () => {
    const body = {
      plan: "p".repeat(15_000),
      decisions: Array.from({ length: 20 }, () => ({
        answer: "a".repeat(300),
      })),
      challenges: Array.from({ length: 10 }, () => ({
        scenario: "s".repeat(600),
      })),
    };
    const request = new Request("https://example.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await expect(readJson(request, z.unknown())).resolves.toEqual(body);
  });

  it("reports invalid JSON and invalid input as client errors", async () => {
    for (const body of ["{", '{"email":"not-an-email"}']) {
      const request = new Request("https://example.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      await expect(
        readJson(request, z.object({ email: z.email() })),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it("does not send internal errors or cache private responses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new Error("sk_secret_from_provider"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("sk_secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sk_secret");
    log.mockRestore();
  });
});
