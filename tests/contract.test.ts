import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/glassbox/llm", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({}));
const { describeChanges, statedNames } = await import("@/lib/glassbox/reviews");

describe("describeChanges", () => {
  it("reports the new #1, where the agent's #1 went, additions and drops", () => {
    expect(
      describeChanges(
        ["Price", "Speed"],
        ["Speed", "Airline"],
        ["Price"],
        ["Airline"],
      ),
    ).toBe(
      "Human moved Price to #1 and Speed to last; added Price; dropped Airline.",
    );
  });

  it("does not double-report a dropped #1, and notes a kept order", () => {
    expect(
      describeChanges(
        ["Honesty", "Accuracy"],
        ["Get the answer", "Accuracy"],
        ["Honesty"],
        ["Get the answer"],
      ),
    ).toBe("Human moved Honesty to #1; added Honesty; dropped Get the answer.");
    expect(describeChanges(["Scale", "Cost"], ["scale", "cost"], [])).toBe(
      "Human kept your priority order.",
    );
  });
});

describe("statedNames", () => {
  it("reads interviewed priorities and legacy string rows", () => {
    expect(
      statedNames([
        { name: "Speed", why: "today" },
        { name: "Airline", why: "" },
      ]),
    ).toEqual(["Speed", "Airline"]);
    expect(statedNames(["Cost", "Scale"])).toEqual(["Cost", "Scale"]);
    expect(statedNames(null)).toEqual([]);
  });
});
