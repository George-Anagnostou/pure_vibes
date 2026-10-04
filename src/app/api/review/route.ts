import { z } from "zod";
import { DecisionSchema, StatedPrioritySchema } from "@/lib/glassbox/types";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { createReview } from "@/lib/glassbox/reviews";
import { errorResponse, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  task: z.string().trim().min(1).max(4000),
  understanding: z.string().trim().max(2000).optional(), // what the agent thinks the task is
  plan: z.string().trim().max(15000).optional(), // the agent's approach
  approach: z.string().trim().max(15000).optional(), // MCP align's name for plan
  agent_name: z.string().trim().max(100).optional(),
  priorities: z.array(StatedPrioritySchema).max(12).optional(),
  decisions: z.array(DecisionSchema).max(12).optional(),
});

// POST /api/review — an agent submits its approach (plan) and the decisions it's making on
// the human's behalf (see DecisionSchema): Reveal + Critique,
// stored as a pending review. Auth: Authorization: Bearer gb_... (agent key).
// Returns only {review_id, align_url, status: "pending"}: the analysis is for the human.
export async function POST(request: Request) {
  try {
    const agent = await requireAgent(request);
    const {
      task,
      understanding,
      plan,
      approach,
      agent_name,
      decisions,
      priorities,
    } = await readJson(request, body);
    const result = await createReview({
      userId: agent.userId,
      agentName: agent_name ?? agent.agentName,
      task,
      understanding,
      plan: plan || approach,
      decisions,
      priorities,
    });
    // No challenge step: the human's pop-up opens right away. Poll
    // GET /api/agent/contract (or MCP get_contract) until approved or rejected.
    return json(
      {
        review_id: result.review_id,
        align_url: result.align_url,
        status: "pending",
        next: "The human may take several minutes. Keep polling GET /api/agent/contract until status is approved or rejected; do not proceed before that.",
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
