import { requireUser } from "@/lib/auth";
import { planGuidance } from "@/lib/glassbox/llm";
import {
  ApprovalSchema,
  DEFAULT_DIALS,
  DEFAULT_HARD_LINES,
  DialsSchema,
  type Dials,
} from "@/lib/glassbox/types";
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readJson,
} from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const nonEmpty = (v: unknown) =>
  v && typeof v === "object" && Object.keys(v).length > 0;

// POST /api/reviews/:id/approve — the human's ranked priorities (added/removed), decisions
// and typed instructions become the contract.
// Only the ranking is required; dials, hard lines and budget come from the request,
// else the human's saved profile, else defaults.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const { id } = await params;
    const approval = await readJson(request, ApprovalSchema);
    // Decisions (current pop-up) or a plain ranking (older clients).
    const ranked = approval.ranked_priorities ?? [];
    if (!ranked.length && !approval.decisions?.length)
      throw new HttpError(400, "Send at least one priority or decision.");

    // RLS: these selects only succeed for the owner.
    const [{ data: review, error }, { data: profile }] = await Promise.all([
      supabase
        .from("reviews")
        .select("task, plan, status")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("dials, hard_lines, budget_cents")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (!review) throw new HttpError(404, "Review not found.");
    if (review.status !== "pending")
      throw new HttpError(409, `Review is already ${review.status}.`);

    const savedDials = DialsSchema.safeParse(profile?.dials);
    const resolved = {
      ...approval,
      dials:
        approval.dials ??
        ((savedDials.success ? savedDials.data : DEFAULT_DIALS) as Dials),
      hard_lines:
        approval.hard_lines ??
        (nonEmpty(profile?.hard_lines)
          ? (profile!.hard_lines as Record<string, boolean>)
          : DEFAULT_HARD_LINES),
      budget_cents: approval.budget_cents ?? profile?.budget_cents ?? 2000,
    };

    const guidance = await planGuidance(
      { task: review.task, plan: review.plan },
      resolved,
      { dialsSet: approval.dials !== undefined },
    );
    const { data: contractId, error: rpcError } = await supabase.rpc(
      "approve_review",
      {
        p_review_id: id,
        p_ranked_priorities: ranked as Json,
        p_dials: resolved.dials as Json,
        p_hard_lines: resolved.hard_lines as Json,
        p_budget_cents: resolved.budget_cents,
        p_plan_guidance: guidance,
        // Typed instructions, one per line (read back as instructions_from_human).
        p_notes:
          [
            ...(resolved.instructions ?? []),
            ...(resolved.notes ? [resolved.notes] : []),
          ].join("\n") || null,
        p_added_by_human: (resolved.added_by_human ?? []) as Json,
        p_removed_by_human: (resolved.removed_by_human ?? []) as Json,
        p_decisions: (resolved.decisions ?? []) as Json,
      },
    );
    if (rpcError) throw new HttpError(409, rpcError.message);
    // Challenge rulings ride alongside the contract the RPC just created for this
    // (verified-owner) review; contracts aren't writable by the session client.
    if (approval.challenges?.length) {
      const { error: chErr } = await createAdminClient()
        .from("contracts")
        .update({ challenges: approval.challenges as Json })
        .eq("review_id", id)
        .eq("user_id", user.id);
      if (chErr) throw chErr;
    }
    return json({ contract_id: contractId, plan_guidance: guidance });
  } catch (error) {
    return errorResponse(error);
  }
}
