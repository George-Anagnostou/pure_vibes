import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/glassbox/llm", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const { answerChallenges } = await import("@/lib/glassbox/reviews");

describe("legacy answerChallenges compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue(db);
    db.select.mockReturnValue(db);
    db.eq.mockReturnValue(db);
    db.maybeSingle.mockResolvedValue({ data: { id: "review-1" }, error: null });
  });

  it("accepts older clients without changing or reopening a review", async () => {
    await expect(
      answerChallenges("review-1", "owner-1", [{ id: "old-challenge" }]),
    ).resolves.toBeUndefined();
    expect(db.eq).toHaveBeenCalledWith("id", "review-1");
    expect(db.eq).toHaveBeenCalledWith("user_id", "owner-1");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts a call with no answers", async () => {
    await expect(
      answerChallenges("review-1", "owner-1"),
    ).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a missing review or one outside the caller's ownership", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      answerChallenges("review-1", "other-user"),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(db.eq).toHaveBeenCalledWith("user_id", "other-user");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("propagates a database failure instead of claiming success", async () => {
    const error = new Error("database unavailable");
    db.maybeSingle.mockResolvedValue({ data: null, error });
    await expect(answerChallenges("review-1", "owner-1")).rejects.toBe(error);
  });
});
