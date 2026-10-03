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
    { name: "Real, accurate data (no fabricated prices)", why: "" },
    { name: "Airline", why: "" },
  ];
  const sg = (
    action: "add" | "drop" | "raise" | "lower",
    priority: string,
    ref = 0,
  ) => ({
    action,
    ref,
    priority,
    why: "",
  });
  const show = (out: { action: string; priority: string }[]) =>
    out.map((s) => `${s.action} ${s.priority}`);

  it("drops suggestions that don't fit the agent's list", () => {
    const out = sanitizeSuggestions(
      [
        sg("add", "Price"),
        sg("add", "speed"),
        sg("raise", "Speed", 1),
        sg("lower", "Airline", 3),
        sg("drop", "Airline", 3),
        sg("drop", "Seat"),
        sg("add", "Price"),
      ],
      stated,
    );
    expect(show(out)).toEqual(["add Price", "drop Airline"]);
  });

  it("resolves paraphrased names and numeric refs to the agent's exact name", () => {
    const out = sanitizeSuggestions(
      [
        sg("raise", "Accuracy / no fabrication", 2),
        sg("lower", "speed"),
        sg("drop", "#3"),
      ],
      stated,
    );
    expect(show(out)).toEqual([
      "raise Real, accurate data (no fabricated prices)",
      "lower Speed",
      "drop Airline",
    ]);
  });
});
