import { z } from "zod";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { runCheckpoint } from "@/lib/glassbox/checkpoint";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({
  action: z.string().trim().min(1).max(200),
  target: z.string().trim().min(1).max(1000),
  details: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/reviews/{id}/checkpoint — agent asks "may I do this?" before acting.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAgent(request);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "Review not found.");
    const body = await readJson(request, Body);
    return json(await runCheckpoint(id, userId, body));
  } catch (error) {
    return errorResponse(error);
  }
}
