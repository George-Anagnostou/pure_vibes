import Stripe from "stripe";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/webhook/route";
import { processStripeEvent } from "@/lib/stripe/webhook";

vi.mock("@/lib/stripe/webhook", () => ({ processStripeEvent: vi.fn() }));
const stripe = new Stripe("sk_test_fake");
const secret = "whsec_test_secret";
const payload = JSON.stringify({
  id: "evt_test",
  object: "event",
  type: "customer.subscription.updated",
  data: { object: { id: "sub_test" } },
});

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.mocked(processStripeEvent).mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function request(
  body = payload,
  signature = stripe.webhooks.generateTestHeaderString({ payload, secret }),
) {
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });
}

it("verifies the raw body before processing", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(processStripeEvent).toHaveBeenCalledWith(
    expect.objectContaining({ id: "evt_test" }),
  );
});

it("rejects tampered payloads and missing signatures", async () => {
  expect((await POST(request(payload + " "))).status).toBe(400);
  expect(
    (
      await POST(
        new Request("https://example.com", { method: "POST", body: payload }),
      )
    ).status,
  ).toBe(400);
  expect(processStripeEvent).not.toHaveBeenCalled();
});

it("returns 500 when persistence fails so Stripe can retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(processStripeEvent).mockRejectedValue(new Error("database down"));
  expect((await POST(request())).status).toBe(500);
});
