import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/glassbox/llm", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({}));
const { describeDecisions, toContract } =
  await import("@/lib/glassbox/reviews");

describe("toContract", () => {
  const row = {
    id: "c0000000-0000-4000-8000-000000000000",
    review_id: "r0000000-0000-4000-8000-000000000000",
    user_id: "u0000000-0000-4000-8000-000000000000",
    // Older contracts stored "Topic: answer" lines as the ranking.
    ranked_priorities: ["Cost", "Accuracy", "Scope: 3 hospitals"],
    dials: { scale: 0.5 },
    hard_lines: {
      no_deception: true,
      budget_cap: true,
      no_unauthorized_access: false,
    },
    budget_cents: 2500,
    plan_guidance: "Start with three hospitals.",
    notes: "Show me results first\n\n  Use CMS files  ",
    added_by_human: ["Cost"],
    removed_by_human: ["Completeness"],
    decisions: [
      {
        topic: "Scope",
        question: "How many?",
        answer: "3 hospitals",
        agent_choice: "All 20",
        changed: true,
      },
      {
        topic: "Data source",
        question: "",
        answer: "CMS files",
        agent_choice: "CMS files",
        changed: false,
      },
    ],
    challenges: [
      {
        id: "c1",
        scenario: "Gaps in UCSF data",
        agent_response: "Use the aggregator",
        approved: true,
      },
      {
        id: "c2",
        scenario: "Prices changed",
        agent_response: "Re-download nightly",
        approved: false,
        instead: "Ask me first",
      },
      {
        id: "c3",
        scenario: "Both unavailable",
        agent_response: "Skip it",
        approved: false,
      }, // overruled with nothing instead: keep the agent's answer
    ],
    created_at: "2026-10-03T00:00:00Z",
  } as unknown as Parameters<typeof toContract>[0];

  it("builds the binding contract from a contracts row", () => {
    const c = toContract(row);
    expect(c.ranked_priorities).toEqual(["Cost", "Accuracy"]);
    expect(c.added_priorities).toEqual(["Cost"]);
    expect(c.removed_priorities).toEqual(["Completeness"]);
    expect(c.hard_lines).toEqual(["no_deception", "budget_max_cents:2500"]);
    expect(c.instructions_from_human).toEqual([
      "Show me results first",
      "Use CMS files",
    ]);
    expect(c.decisions).toEqual([
      {
        topic: "Scope",
        question: "How many?",
        decision: "3 hospitals",
        changed_by_human: true,
        your_original_choice: "All 20",
      },
      {
        topic: "Data source",
        question: "",
        decision: "CMS files",
        changed_by_human: false,
      },
    ]);
    expect(c.situations).toEqual([
      {
        situation: "Gaps in UCSF data",
        do_this: "Use the aggregator",
        human_overrode_you: false,
      },
      {
        situation: "Prices changed",
        do_this: "Ask me first",
        human_overrode_you: true,
      },
      {
        situation: "Both unavailable",
        do_this: "Skip it",
        human_overrode_you: false,
      },
    ]);
    expect(c.plan_guidance).toBe("Start with three hospitals.");
    expect(c.message).toContain(
      "Cost > Accuracy (added Cost; removed Completeness)",
    );
    expect(c.message).toContain(
      "changed 1 of 2 decisions: Scope → 3 hospitals",
    );
    expect(c.message).toContain("overruled you on 1 situation");
  });

  it("tolerates null jsonb columns on old rows", () => {
    const c = toContract({
      ...row,
      ranked_priorities: null,
      decisions: null,
      challenges: null,
      notes: null,
      plan_guidance: null,
      added_by_human: null,
      removed_by_human: null,
    } as unknown as Parameters<typeof toContract>[0]);
    expect(c.ranked_priorities).toEqual([]);
    expect(c.situations).toEqual([]);
    expect(c.instructions_from_human).toEqual([]);
    expect(c.plan_guidance).toBe("");
  });
});

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
