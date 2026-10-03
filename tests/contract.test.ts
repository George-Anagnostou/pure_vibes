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

vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn() }));

describe("sanitizeSuggestions", async () => {
  vi.doUnmock("@/lib/glassbox/llm");
  const { sanitizeSuggestions } =
    await vi.importActual<typeof import("@/lib/glassbox/llm")>(
      "@/lib/glassbox/llm",
    );
  const stated = [
    { name: "Speed", why: "" },
    { name: "Airline", why: "" },
  ];
  it("drops suggestions that don't fit the agent's list", () => {
    const out = sanitizeSuggestions(
      [
        { action: "add", priority: "Price", why: "" },
        { action: "add", priority: "speed", why: "" },
        { action: "raise", priority: "Speed", why: "" },
        { action: "lower", priority: "Airline", why: "" },
        { action: "drop", priority: "Airline", why: "" },
        { action: "drop", priority: "Seat", why: "" },
        { action: "add", priority: "Price", why: "" },
      ],
      stated,
    );
    expect(out.map((s) => `${s.action} ${s.priority}`)).toEqual([
      "add Price",
      "drop Airline",
    ]);
  });
});
