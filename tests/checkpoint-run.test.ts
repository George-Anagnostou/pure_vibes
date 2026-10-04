import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "@/lib/glassbox/types";

// runCheckpoint wiring: which contract fields reach the rules engine, and what
// gets logged. The engine itself is covered in checkpoint.test.ts.
const reviews = vi.hoisted(() => ({
  getContract: vi.fn(),
  logEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/glassbox/reviews", () => reviews);
const { runCheckpoint } = await import("@/lib/glassbox/checkpoint");

const contract = (over: Partial<Contract> = {}): Contract => ({
  review_id: "r1",
  ranked_priorities: ["Cost", "Speed"],
  added_priorities: [],
  removed_priorities: [],
  decisions: [
    {
      topic: "Scope",
      question: "How many?",
      decision: "All 20 hospitals",
      changed_by_human: false,
    },
  ],
  situations: [],
  instructions_from_human: [],
  plan_guidance: "",
  hard_lines: ["no_unauthorized_access", "no_deception"],
  budget_cents: 2000,
  dials: {
    scale: 0.5,
    cost_vs_speed: 0.5,
    polish: 0.5,
    novelty: 0.5,
    autonomy: 0.5,
  },
  instructions: "",
  message: "",
  ...over,
});

const alb = { action: "provision", target: "AWS Application Load Balancer" };

describe("runCheckpoint", () => {
  beforeEach(() => {
    reviews.getContract.mockReset();
    reviews.logEvent.mockClear();
  });

  it("judges drift against the human's #1 ranked priority and logs it", async () => {
    reviews.getContract.mockResolvedValue({
      status: "approved",
      contract: contract(),
    });
    const r = await runCheckpoint("r1", "u1", alb);
    expect(r.decision).toBe("warn");
    expect(r.reason).toContain("'Cost', the human's #1 priority");
    expect(reviews.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: "r1",
        userId: "u1",
        type: "drift",
        action: "provision AWS Application Load Balancer",
      }),
    );
  });

  it("falls back to the first decision for contracts without a ranking", async () => {
    reviews.getContract.mockResolvedValue({
      status: "approved",
      contract: contract({
        ranked_priorities: [],
        decisions: [
          {
            topic: "Budget",
            question: "",
            decision: "keep it cheap",
            changed_by_human: true,
          },
        ],
      }),
    });
    const r = await runCheckpoint("r1", "u1", alb);
    expect(r.decision).toBe("warn");
    expect(r.reason).toContain("'Budget: keep it cheap'");
  });

  it("uses the contract's hard lines and logs blocks as breaches", async () => {
    reviews.getContract.mockResolvedValue({
      status: "approved",
      contract: contract(),
    });
    const r = await runCheckpoint("r1", "u1", {
      action: "fetch",
      target: "/mock/answer-key",
    });
    expect(r).toMatchObject({
      decision: "block",
      hard_line: "no_unauthorized_access",
    });
    expect(reviews.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "breach" }),
    );
  });

  it("blocks without logging when there is no approved contract", async () => {
    reviews.getContract.mockResolvedValue({
      status: "pending",
      align_url: "https://example.com/align/r1",
    });
    const r = await runCheckpoint("r1", "u1", alb);
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("call align first");
    expect(reviews.logEvent).not.toHaveBeenCalled();
  });
});
