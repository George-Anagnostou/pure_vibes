import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/glassbox/summarize";

describe("summarize", () => {
  it("keeps short first sentences and drops the final period", () => {
    expect(summarize("Plan a trip to Lisbon. Keep it cheap.")).toBe(
      "Plan a trip to Lisbon",
    );
  });

  it("cuts long sentences at a word boundary with an ellipsis", () => {
    const task =
      "Pull every quarterly revenue figure for the top fifty software companies and reconcile them against filings";
    const out = summarize(task);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(90);
    const head = out.slice(0, -1);
    expect(task.startsWith(head)).toBe(true);
    expect(task[head.length]).toBe(" "); // ended on a whole word
  });

  it("strips trailing punctuation before the ellipsis", () => {
    const out = summarize(
      `${"word ".repeat(16)}alpha, ${"beta ".repeat(10)}`,
      90,
    );
    expect(out).not.toMatch(/[,\s]…$/);
  });

  it("hard-cuts a single word longer than the limit", () => {
    expect(summarize("x".repeat(200))).toBe(`${"x".repeat(89)}…`);
  });
});
