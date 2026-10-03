import { requireUser } from "@/lib/auth";
import { planGuidance } from "@/lib/glassbox/llm";
import { ApprovalSchema } from "@/lib/glassbox/types";
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from "@/lib/http";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/reviews/:id/approve — the human's re-ranked priorities become the contract.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireUser();
    const { id } = await params;
    const approval = await readJson(request, ApprovalSchema);

    // RLS: this select only succeeds for the review's owner.
    const { data: review, error } = await supabase.from("reviews").select("task, plan, status").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!review) throw new HttpError(404, "Review not found.");
    if (review.status !== "pending") throw new HttpError(409, `Review is already ${review.status}.`);

    const guidance = await planGuidance({ task: review.task, plan: review.plan }, approval);
    const { data: contractId, error: rpcError } = await supabase.rpc("approve_review", {
      p_review_id: id,
      p_ranked_priorities: approval.ranked_priorities as Json,
      p_dials: approval.dials as Json,
      p_hard_lines: approval.hard_lines as Json,
      p_budget_cents: approval.budget_cents,
      p_plan_guidance: guidance,
      p_notes: approval.notes ?? null,
    });
    if (rpcError) throw new HttpError(409, rpcError.message);
    return json({ contract_id: contractId, plan_guidance: guidance });
  } catch (error) {
    return errorResponse(error);
  }
}
