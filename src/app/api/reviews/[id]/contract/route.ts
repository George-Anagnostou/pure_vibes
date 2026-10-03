import { requireAgent } from "@/lib/glassbox/agent-auth";
import { getContract } from "@/lib/glassbox/reviews";
import { errorResponse, HttpError, json } from "@/lib/http";

export const runtime = "nodejs";

// GET /api/reviews/:id/contract — agent polls for the human's decision.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const agent = await requireAgent(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid review id.");
    return json(await getContract(id, agent.userId));
  } catch (error) {
    return errorResponse(error);
  }
}
