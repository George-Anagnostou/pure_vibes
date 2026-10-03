import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/billing/checkout/route";
import { getBillingPlan } from "@/lib/stripe/plan";
import { getOrCreateCustomer } from "@/lib/stripe/customer";

const stripe = vi.hoisted(() => ({
  subscriptions: { list: vi.fn() },
  checkout: { sessions: { list: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ user: { id: "verified-user" } }),
}));
vi.mock("@/lib/stripe/plan", () => ({ getBillingPlan: vi.fn() }));
vi.mock("@/lib/stripe/customer", () => ({ getOrCreateCustomer: vi.fn() }));
vi.mock("@/lib/stripe/client", () => ({ stripeClient: () => stripe }));

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://example.com");
  vi.clearAllMocks();
  vi.mocked(getOrCreateCustomer).mockResolvedValue("cus_owned");
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.checkout.sessions.list.mockResolvedValue({ data: [] });
  stripe.checkout.sessions.create.mockResolvedValue({
    url: "https://checkout.stripe.com/test",
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function request() {
  return new Request("https://example.com/api/billing/checkout", {
    method: "POST",
    headers: { origin: "https://example.com" },
    body: JSON.stringify({ price: "attacker-price", user_id: "other-user" }),
  });
}

it("does not create a customer or checkout when the configured plan is invalid", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getBillingPlan).mockRejectedValueOnce(new Error("Inactive price"));
  expect((await POST(request())).status).toBe(500);
  expect(getOrCreateCustomer).not.toHaveBeenCalled();
  expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
});

it("uses verified ownership and the server plan with quantity one", async () => {
  vi.mocked(getBillingPlan).mockResolvedValueOnce({
    priceId: "price_monthly",
    name: "Glass Box",
    currency: "usd",
    unitAmount: 1000,
    interval: "month",
    includedCheckpoints: 100,
    overagePolicy: "blocked",
    version: "1",
  });
  expect((await POST(request())).status).toBe(200);
  expect(getOrCreateCustomer).toHaveBeenCalledWith("verified-user");
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      customer: "cus_owned",
      line_items: [{ price: "price_monthly", quantity: 1 }],
      client_reference_id: "verified-user",
      metadata: { price_id: "price_monthly", plan_version: "1" },
    }),
    expect.any(Object),
  );
});
