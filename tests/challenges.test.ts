import { describe, expect, it } from "vitest";
import { sanitizeChallenges } from "@/lib/glassbox/llm";

const priorities = [
  "Completeness",
  "Accuracy",
  "Finish in one pass",
  "Low cost",
].map((name) => ({ name, why: "" }));
const challenge = (
  priority_numbers: number[],
  tests: string[],
  scenario = "Which do you pick?",
) => ({ id: "x", scenario, why_it_matters: "w", priority_numbers, tests });

describe("sanitizeChallenges", () => {
  it("maps paraphrased names onto the agent's priorities by number", () => {
    const [c] = sanitizeChallenges(
      [challenge([1, 3], ["Completeness", "Speed"])],
      priorities,
    );
    expect(c.tests).toEqual(["Completeness", "Finish in one pass"]);
    expect(c.priority_numbers).toEqual([1, 3]);
  });

  it("falls back to name matching when numbers are missing or out of range", () => {
    const [c] = sanitizeChallenges(
      [challenge([9, 9], ["accuracy", "low cost"])],
      priorities,
    );
    expect(c.tests).toEqual(["Accuracy", "Low cost"]);
  });

  it("numbers challenges c1..cN and drops empty scenarios", () => {
    const out = sanitizeChallenges(
      [
        challenge([1, 2], []),
        challenge([1, 2], [], "  "),
        challenge([2, 4], []),
      ],
      priorities,
    );
    expect(out.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});
