import { afterEach, expect, it, vi } from "vitest";
import { parseBillingPlan } from "@/lib/stripe/plan";
import { GET } from "@/app/api/billing/plan/route";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/http";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));

const price = {
  id: "price_monthly",
  active: true,
  billing_scheme: "per_unit",
  type: "recurring",
  currency: "usd",
  unit_amount: 1000,
  transform_quantity: null,
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  product: { id: "prod_glassbox", active: true, name: "Glass Box Individual" },
  metadata: {
    included_checkpoints: "100",
    overage_policy: "blocked",
    plan_version: "1",
  },
};

afterEach(() => vi.restoreAllMocks());

it("exposes the configured price and allowance without exposing other metadata", () => {
  expect(parseBillingPlan(price)).toEqual({
    priceId: "price_monthly",
    name: "Glass Box Individual",
    currency: "usd",
    unitAmount: 1000,
    interval: "month",
    includedCheckpoints: 100,
    overagePolicy: "blocked",
    version: "1",
  });
});

it.each(["", "0", "-1", "1.5", "100x", "1e3", "9007199254740992"])(
  "rejects an invalid allowance %j rather than granting unlimited access",
  (included_checkpoints) => {
    expect(() =>
      parseBillingPlan({
        ...price,
        metadata: { ...price.metadata, included_checkpoints },
      }),
    ).toThrow();
  },
);

it("rejects archived products/prices and unexpected charging models", () => {
  for (const changes of [
    { active: false },
    { product: { ...price.product, active: false } },
    { product: { id: "prod_deleted", deleted: true } },
    { recurring: { ...price.recurring, interval: "year" } },
    { recurring: { ...price.recurring, interval_count: 2 } },
    { recurring: { ...price.recurring, usage_type: "metered" } },
    { transform_quantity: { divide_by: 10, round: "up" } },
    { metadata: { ...price.metadata, overage_policy: "charge" } },
    { unit_amount: null },
  ]) {
    expect(() => parseBillingPlan({ ...price, ...changes })).toThrow();
  }
});

it("requires authentication before fetching the Stripe plan", async () => {
  vi.mocked(requireUser).mockRejectedValueOnce(new HttpError(401, "Sign in."));
  const response = await GET();
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
