import { describe, expect, it } from "vitest";
import {
  buildGuidancePrompt,
  fallbackGuidance,
  humanChanges,
  NO_CHANGES_GUIDANCE,
  priorityOrderChanged,
  type ResolvedApproval,
} from "@/lib/glassbox/guidance";
import { DEFAULT_DIALS, DEFAULT_HARD_LINES } from "@/lib/glassbox/types";

const base = (over: Partial<ResolvedApproval> = {}): ResolvedApproval => ({
  dials: DEFAULT_DIALS,
  hard_lines: DEFAULT_HARD_LINES,
  budget_cents: 2000,
  ranked_priorities: ["Accuracy", "Speed"],
  decisions: [
    {
      topic: "Source",
      question: "Which data source?",
      answer: "Official API",
      agent_choice: "Official API",
      changed: false,
    },
  ],
  ...over,
});
const agent = ["Accuracy", "Speed"];

describe("plan guidance prompt", () => {
  it("reports no changes when the human kept everything (defaults are not changes)", () => {
    const changes = humanChanges(base(), { agentPriorities: agent });
    expect(changes).toEqual([]);
    expect(fallbackGuidance(changes)).toBe(NO_CHANGES_GUIDANCE);
    const { prompt } = buildGuidancePrompt("<task/>", base(), {
      agentPriorities: agent,
    });
    expect(prompt).not.toMatch(/Never access anything without permission/);
    expect(prompt).not.toMatch(/Hard lines/i);
    expect(prompt).not.toMatch(/Dials/);
  });

  it("only mentions hard lines and dials the request actually set", () => {
    const changes = humanChanges(
      base({ hard_lines: { ...DEFAULT_HARD_LINES, budget_cap: true } }),
      { hardLinesSet: true, dialsSet: true, agentPriorities: agent },
    );
    expect(changes.join("\n")).toMatch(
      /Hard lines: .*Never access anything without permission.*budget \$20\.00/,
    );
    expect(changes.join("\n")).toMatch(/Dials: scale 0\.50/);
  });

  it("leads with what the human changed, in order", () => {
    const changes = humanChanges(
      base({
        ranked_priorities: ["Speed", "Accuracy", "Low cost"],
        added_by_human: ["Low cost"],
        removed_by_human: ["Polish"],
        decisions: [
          {
            topic: "Source",
            question: "Which data source?",
            answer: "Scrape the site",
            agent_choice: "Official API",
            changed: true,
          },
          {
            topic: "Format",
            question: "Output?",
            answer: "CSV",
            agent_choice: "CSV",
            changed: false,
          },
        ],
        challenges: [
          {
            id: "c1",
            scenario: "API is down",
            agent_response: "Wait",
            approved: false,
            instead: "Ask me",
          },
          {
            id: "c2",
            scenario: "Rate limited",
            agent_response: "Back off",
            approved: true,
          },
        ],
        instructions: ["Show me a sample first"],
      }),
      { agentPriorities: agent },
    );
    expect(changes).toEqual([
      expect.stringMatching(
        /^Re-ranked priorities.*Speed > Accuracy > Low cost.*the agent had: Accuracy > Speed/,
      ),
      "Added priorities: Low cost",
      expect.stringMatching(/^Removed priorities.*Polish/),
      expect.stringMatching(
        /^Decision "Source": Scrape the site \(instead of the agent's choice: Official API\)/,
      ),
      expect.stringMatching(
        /^Situation overruled: "API is down" -> do this instead: Ask me/,
      ),
      "Instruction: Show me a sample first",
    ]);
    const { prompt } = buildGuidancePrompt("<task/>", base(), {
      agentPriorities: agent,
    });
    expect(prompt).toMatch(/UNCHANGED \(context only/);
  });

  it("detects re-ranking but ignores pure additions/removals", () => {
    expect(priorityOrderChanged(["A", "B", "C"], ["A", "B", "C"])).toBe(false);
    expect(priorityOrderChanged(["A", "B", "C"], ["A", "C"])).toBe(false);
    expect(priorityOrderChanged(["A", "B"], ["A", "New", "B"])).toBe(false);
    expect(priorityOrderChanged(["A", "B", "C"], ["b", "a", "c"])).toBe(true);
    expect(priorityOrderChanged([], ["A", "B"])).toBe(false);
  });

  it("fallback text lists the changes and says nothing else changed", () => {
    expect(fallbackGuidance(["Instruction: Use CSV"])).toBe(
      "Follow the human's changes exactly: Instruction: Use CSV. No other changes.",
    );
  });
});
