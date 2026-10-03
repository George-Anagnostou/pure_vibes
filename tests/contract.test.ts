import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/glassbox/llm", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({}));
const { describeChanges } = await import("@/lib/glassbox/reviews");

describe("describeChanges", () => {
  it("reports the new #1, where the old #1 went, and additions", () => {
    expect(
      describeChanges(
        ["Cost", "Just for me", "Security", "Polish", "Scale"],
        ["Scale", "Polish", "Novelty"],
        ["Security"],
      ),
    ).toBe("Human moved Cost to #1 and Scale to last; added Security.");
  });

  it("notes a dropped priority and a kept order", () => {
    expect(describeChanges(["Cost"], ["Scale"], [])).toBe(
      "Human moved Cost to #1 and dropped Scale.",
    );
    expect(describeChanges(["Scale", "Cost"], ["scale", "cost"], [])).toBe(
      "Human kept the plan's priority order.",
    );
  });
});
