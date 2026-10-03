import { z } from "zod";
import { StatedPrioritySchema } from "@/lib/glassbox/types";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { createReview } from "@/lib/glassbox/reviews";
import { errorResponse, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z
  .object({
    task: z.string().trim().min(1).max(4000),
    plan: z.string().trim().max(15000).optional(),
    agent_name: z.string().trim().max(100).optional(),
    steps: z.array(StatedPrioritySchema).min(1).max(20).optional(),
    priorities: z.array(StatedPrioritySchema).min(1).max(20).optional(), // legacy name
  })
  .refine((b) => b.steps || b.priorities, {
    message: "Send your approach as steps.",
  });

// POST /api/review — an agent submits its approach as steps ({name, how, uses, est_tokens,
// est_cost_usd, why, source}[]) and optional thinking: Reveal + Critique,
// stored as a pending review. Auth: Authorization: Bearer gb_... (agent key).
// Returns only {review_id, align_url}: the analysis is for the human, not the agent.
export async function POST(request: Request) {
  try {
    const agent = await requireAgent(request);
    const { task, plan, agent_name, steps, priorities } = await readJson(
      request,
      body,
    );
    const result = await createReview({
      userId: agent.userId,
      agentName: agent_name ?? agent.agentName,
      task,
      plan,
      stated: steps ?? priorities,
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
