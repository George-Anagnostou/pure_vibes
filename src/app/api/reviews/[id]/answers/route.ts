import { z } from "zod";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { alignUrl, answerChallenges } from "@/lib/glassbox/reviews";
import { ChallengeAnswerSchema } from "@/lib/glassbox/types";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({
  answers: z.array(ChallengeAnswerSchema).min(1).max(10),
});

// POST /api/reviews/:id/answers — the agent answers Glass Box's challenges; the human's
// pop-up opens after this. Returns {status: "pending", align_url}.
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireAgent(request);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success)
      throw new HttpError(404, "Review not found.");
    const { answers } = await readJson(request, Body);
    await answerChallenges(id, userId, answers);
    return json({ review_id: id, status: "pending", align_url: alignUrl(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
