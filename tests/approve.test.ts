import { describe, expect, it, vi } from "vitest";
import {
  approveReview,
  isMissingFunction,
  type ApproveArgs,
} from "@/lib/glassbox/approve";

const args: ApproveArgs = {
  p_review_id: "r1",
  p_ranked_priorities: ["A"],
  p_dials: {},
  p_hard_lines: {},
  p_budget_cents: 0,
  p_plan_guidance: "g",
  p_notes: null,
  p_added_by_human: [],
  p_removed_by_human: [],
  p_decisions: [],
};
const ruling = {
  id: "c1",
  scenario: "s",
  agent_response: "r",
  approved: true,
};

describe("approveReview", () => {
  it("writes challenges in the same RPC when the migration is applied", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "k1", error: null });
    const write = vi.fn();
    const out = await approveReview(rpc, write, args, [ruling]);
    expect(out).toEqual({ contractId: "k1", error: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0].p_challenges).toEqual([ruling]);
    expect(write).not.toHaveBeenCalled();
  });

  it("omits p_challenges when there are none", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "k1", error: null });
    await approveReview(rpc, vi.fn(), args, []);
    expect(rpc.mock.calls[0][0]).not.toHaveProperty("p_challenges");
  });

  it("falls back to the two-step write before the migration", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function" },
      })
      .mockResolvedValueOnce({ data: "k2", error: null });
    const write = vi.fn().mockResolvedValue({ error: null });
    const out = await approveReview(rpc, write, args, [ruling]);
    expect(out).toEqual({ contractId: "k2", error: null });
    expect(rpc.mock.calls[1][0]).not.toHaveProperty("p_challenges");
    expect(write).toHaveBeenCalledWith([ruling]);
  });

  it("does not fall back on other errors (e.g. already decided)", async () => {
    const err = { code: "P0002", message: "Review not found" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: err });
    const write = vi.fn();
    const out = await approveReview(rpc, write, args, [ruling]);
    expect(out.error).toBe(err);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  it("recognizes missing-function errors", () => {
    expect(
      isMissingFunction({
        code: "42883",
        message: "function public.approve_review(...) does not exist",
      }),
    ).toBe(true);
    expect(isMissingFunction({ code: "P0002" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});
