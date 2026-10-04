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
// Returns only {review_id, align_url}: the analysis is for the human, not the agent.
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
      agentName: agent_name || agent.agentName,
      task,
      understanding,
      plan: plan || approach,
      decisions,
      priorities,
    });
    // The agent answers Glass Box's challenges first; the human's pop-up opens after.
    const challenges = result.critique.challenges;
    return json(
      challenges.length
        ? {
            review_id: result.review_id,
            status: "answer_challenges",
            challenges: challenges.map(({ id, scenario, tests }) => ({
              id,
              scenario,
              trade_off: tests.join(" vs "),
            })),
            next: `POST /api/reviews/${result.review_id}/answers with {answers: [{id, response, favors, would_ask_human}]}`,
          }
        : {
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
