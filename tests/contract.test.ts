import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/glassbox/llm", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({}));
const { describeDecisions } = await import("@/lib/glassbox/reviews");

describe("describeDecisions", () => {
  const d = (topic: string, answer: string, changed: boolean) => ({
    topic,
    question: "",
    answer,
    changed,
  });
  it("lists what the human changed and their instructions", () => {
    expect(
      describeDecisions(
        [
          d("Scope", "3-hospital proof of concept", true),
          d("Data source", "CMS files", false),
        ],
        ["Show me results before scaling"],
      ),
    ).toBe(
      "The human changed 1 of 2 decisions: Scope → 3-hospital proof of concept. They also told you: Show me results before scaling.",
    );
  });
  it("mentions situations the human overruled", () => {
    expect(
      describeDecisions([d("Scope", "All", false)], [], undefined, [
        "Pick a price",
      ]),
    ).toBe(
      "The human kept all 1 of your decisions. The human overruled you on 1 situation: do what `situations` says, not what you answered.",
    );
  });
  it("says when everything was kept", () => {
    expect(describeDecisions([d("Scope", "All", false)], [])).toBe(
      "The human kept all 1 of your decisions.",
    );
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
  const decision = (topic: string, choice: string) => ({
    topic,
    question: `${topic}?`,
    choice,
    thinks_you_want: "",
    why: "",
    alternatives: [{ option: "x", tradeoff: "y" }],
  });
  const decisions = [
    decision("Scope", "All 20 hospitals"),
    decision("Data source", "CMS files"),
  ];
  const sg = (
    action: "challenge" | "add",
    topic: string,
    recommend: string,
    ref = 0,
  ) => ({
    action,
    ref,
    topic,
    question: "",
    recommend,
    options: [],
    why: "",
  });

  it("keeps real challenges and new decisions, normalized to the agent's topic", () => {
    const out = sanitizeSuggestions(
      [
        sg("challenge", "scope", "3-hospital proof of concept", 1),
        sg("challenge", "Data source", "CMS files", 2), // same as agent's choice
        sg("challenge", "Timeline", "Today", 9), // no such decision
        sg("add", "Missing data", "Mark as unavailable"),
        sg("add", "Scope", "Top 5"), // already a decision
        sg("challenge", "Scope", "Top 5", 1), // duplicate challenge
      ],
      decisions,
    );
    expect(
      out.map((s) => `${s.action} ${s.topic} → ${s.recommend} (#${s.ref})`),
    ).toEqual([
      "challenge Scope → 3-hospital proof of concept (#1)",
      "add Missing data → Mark as unavailable (#0)",
    ]);
  });
});
