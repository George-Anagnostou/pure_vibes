import { requireAgent } from "@/lib/glassbox/agent-auth";
import { getContract } from "@/lib/glassbox/reviews";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

// GET /api/agent/contract — the newest review for this agent key's owner and its contract.
// Used by Claude Code hooks, which know the agent key but not the review_id.
// Returns {status: "none"} when the agent has never aligned.
export async function GET(request: Request) {
  try {
    const agent = await requireAgent(request);
    const { data: review, error } = await agent.admin
      .from("reviews")
      .select("id, task")
      .eq("user_id", agent.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!review) return json({ status: "none" });
    return json({
      review_id: review.id,
      task: review.task,
      ...(await getContract(review.id, agent.userId)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
