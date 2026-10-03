import { z } from "zod";
import { DecisionSchema } from "@/lib/glassbox/types";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { createReview } from "@/lib/glassbox/reviews";
import { errorResponse, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  task: z.string().trim().min(1).max(4000),
  plan: z.string().trim().max(15000).optional(), // the agent's approach
  agent_name: z.string().trim().max(100).optional(),
  decisions: z.array(DecisionSchema).min(1).max(12),
});

// POST /api/review — an agent submits its approach (plan) and the decisions it's making on
// the human's behalf (see DecisionSchema): Reveal + Critique,
// stored as a pending review. Auth: Authorization: Bearer gb_... (agent key).
// Returns only {review_id, align_url}: the analysis is for the human, not the agent.
export async function POST(request: Request) {
  try {
    const agent = await requireAgent(request);
    const { task, plan, agent_name, decisions } = await readJson(request, body);
    const result = await createReview({
      userId: agent.userId,
      agentName: agent_name ?? agent.agentName,
      task,
      plan,
      decisions,
    });
    return json(
      {
        review_id: result.review_id,
        align_url: result.align_url,
        status: "pending",
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
