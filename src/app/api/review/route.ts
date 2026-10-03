import { z } from "zod";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { createReview } from "@/lib/glassbox/reviews";
import { errorResponse, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  task: z.string().trim().min(1).max(4000),
  plan: z.string().trim().min(1).max(15000),
  agent_name: z.string().trim().max(100).optional(),
  its_priorities: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
});

// POST /api/review — an agent submits a plan (+ its own stated priorities): Reveal + Critique,
// stored as a pending review. Auth: Authorization: Bearer gb_... (agent key).
// Returns {review_id, align_url, revealed, critique}.
export async function POST(request: Request) {
  try {
    const agent = await requireAgent(request);
    const { task, plan, agent_name, its_priorities } = await readJson(
      request,
      body,
    );
    const result = await createReview({
      userId: agent.userId,
      agentName: agent_name ?? agent.agentName,
      task,
      plan,
      stated: its_priorities,
    });
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
