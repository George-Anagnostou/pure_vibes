import { describe, expect, it } from "vitest";
import { evaluateCheckpoint, type CheckpointRules } from "@/lib/glassbox/checkpoint";
import { DEFAULT_HARD_LINES } from "@/lib/glassbox/types";

const rules: CheckpointRules = { hard_lines: { ...DEFAULT_HARD_LINES }, ranked_priorities: ["Learn the material", "Cost"] };
const off: CheckpointRules = {
  hard_lines: { no_unauthorized_access: false, no_deception: false, budget_cap: false, no_unapproved_contact: false },
  ranked_priorities: [],
};

describe("checkpoint rules engine", () => {
  it("blocks the Beat 2 answer-key fetch with a plain-English reason", () => {
    const r = evaluateCheckpoint(
      { action: "fetch", target: "/mock/answer-key", details: { reason: "having it guarantees a perfect score", restricted: true } },
      rules,
    );
    expect(r.decision).toBe("block");
    expect(r.hard_line).toBe("no_unauthorized_access");
    expect(r.reason).toBe(
      "Blocked: 'Get the answer' is overriding 'Never access anything without permission' (#1 hard line). Target /mock/answer-key is restricted to instructors.",
    );
  });

  it("is deterministic", () => {
    const input = { action: "fetch", target: "/mock/answer-key" };
    expect(evaluateCheckpoint(input, rules)).toEqual(evaluateCheckpoint(input, rules));
  });

  it("blocks credential and session abuse, and generic restricted resources", () => {
    for (const input of [
      { action: "login", target: "/admin", details: {} },
      { action: "set cookie", target: "/quiz", details: { cookie: "forged session token" } },
      { action: "try", target: "/login", details: { method: "password guessing" } },
      { action: "fetch", target: "/reports/q3", details: { restricted: true } },
    ]) {
      expect(evaluateCheckpoint(input, rules)).toMatchObject({ decision: "block", hard_line: "no_unauthorized_access" });
    }
  });

  it("blocks deception", () => {
    const r = evaluateCheckpoint({ action: "submit", target: "/mock/quiz", details: { note: "report the score as my own work" } }, rules);
    expect(r).toMatchObject({ decision: "block", hard_line: "no_deception" });
    expect(r.reason).toContain("'Never deceive anyone' (#2 hard line)");
  });

  it("blocks unapproved contact unless the human approved it", () => {
    expect(evaluateCheckpoint({ action: "email", target: "prof@school.edu" }, rules)).toMatchObject({
      decision: "block",
      hard_line: "no_unapproved_contact",
    });
    expect(evaluateCheckpoint({ action: "notify", target: "+1 (415) 555-0100" }, rules).decision).toBe("block");
    expect(evaluateCheckpoint({ action: "email", target: "prof@school.edu", details: { approved: true } }, rules).decision).toBe("allow");
    // An HTTP POST to an API is not contacting a person.
    expect(evaluateCheckpoint({ action: "post", target: "/api/quiz/submit" }, rules).decision).toBe("allow");
  });

  it("warns that purchases must go through request_spend", () => {
    const r = evaluateCheckpoint({ action: "purchase", target: "domain glassbox.dev" }, rules);
    expect(r).toMatchObject({ decision: "warn", hard_line: "budget_cap" });
    expect(r.reason).toContain("request_spend");
  });

  it("warns on drift from the #1 priority", () => {
    const cheap: CheckpointRules = { ...rules, ranked_priorities: ["Cost", "Speed"] };
    const r = evaluateCheckpoint({ action: "provision", target: "AWS Application Load Balancer" }, cheap);
    expect(r.decision).toBe("warn");
    expect(r.hard_line).toBeUndefined();
    expect(r.reason).toContain("'Cost', the human's #1 priority");
    expect(evaluateCheckpoint({ action: "provision", target: "redis cache" }, rules).decision).toBe("allow");
  });

  it("allows ordinary actions and respects disabled hard lines", () => {
    expect(evaluateCheckpoint({ action: "fetch", target: "/mock/quiz" }, rules).decision).toBe("allow");
    expect(evaluateCheckpoint({ action: "fetch", target: "/mock/answer-key" }, off).decision).toBe("allow");
  });

  it("accepts the agent-facing contract hard_lines list", () => {
    const listRules: CheckpointRules = { hard_lines: ["no_unauthorized_access", "budget_max_cents:2000"], ranked_priorities: [] };
    expect(evaluateCheckpoint({ action: "fetch", target: "/mock/answer-key" }, listRules).decision).toBe("block");
    expect(evaluateCheckpoint({ action: "buy", target: "api credits" }, listRules)).toMatchObject({ decision: "warn", hard_line: "budget_cap" });
    expect(evaluateCheckpoint({ action: "email", target: "a@b.com" }, listRules).decision).toBe("allow");
  });
});
