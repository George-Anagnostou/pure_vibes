import "server-only";
import { appUrl } from "@/lib/env";
import { revealAndCritique } from "@/lib/glassbox/llm";
import type { Contract, Critique, Dials, Revealed, ReviewStatus } from "@/lib/glassbox/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContractRow, Json } from "@/types/database";

// Server-side review lifecycle shared by the HTTP API and the MCP server.
// All calls here use the admin client, so callers MUST have authenticated the
// agent (requireAgent) and pass its owning userId.

export type ReviewResult = {
  review_id: string;
  approval_url: string;
  revealed: Revealed;
  critique: Critique;
};

export async function createReview(input: { userId: string; agentName: string; task: string; plan: string }): Promise<ReviewResult> {
  const { revealed, critique } = await revealAndCritique({ task: input.task, plan: input.plan });
  const { data, error } = await createAdminClient()
    .from("reviews")
    .insert({
      user_id: input.userId,
      agent_name: input.agentName,
      task: input.task,
      plan: input.plan,
      revealed: revealed as unknown as Json,
      critique: critique as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { review_id: data.id, approval_url: `${appUrl()}/approve/${data.id}`, revealed, critique };
}

export function toContract(row: ContractRow): Contract {
  const hardLines = row.hard_lines as Record<string, boolean>;
  const ranked = row.ranked_priorities as string[];
  const lines = Object.entries(hardLines)
    .filter(([, on]) => on)
    .map(([k]) => (k === "budget_cap" ? `budget_max_cents:${row.budget_cents}` : k));
  return {
    review_id: row.review_id,
    ranked_priorities: ranked,
    dials: row.dials as Dials,
    hard_lines: lines,
    budget_cents: row.budget_cents,
    plan_guidance: row.plan_guidance ?? "",
    message: `Human approved. Top priorities: ${ranked.slice(0, 3).join(" > ")}.${row.notes ? ` Note: ${row.notes}` : ""}`,
  };
}

export type ContractLookup =
  | { status: "approved"; contract: Contract }
  | { status: Exclude<ReviewStatus, "approved">; approval_url: string };

export async function getContract(reviewId: string, userId: string): Promise<ContractLookup> {
  const admin = createAdminClient();
  const { data: review, error } = await admin
    .from("reviews")
    .select("id, status")
    .eq("id", reviewId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new Error("Review not found");
  if (review.status !== "approved") {
    return { status: review.status as Exclude<ReviewStatus, "approved">, approval_url: `${appUrl()}/approve/${reviewId}` };
  }
  const { data: row, error: cErr } = await admin.from("contracts").select("*").eq("review_id", reviewId).single();
  if (cErr) throw cErr;
  return { status: "approved", contract: toContract(row) };
}

// Poll until the human decides or the deadline passes. Kept well under serverless
// limits; agents fall back to get_contract when this returns pending.
export async function waitForContract(reviewId: string, userId: string, timeoutMs = 45_000): Promise<ContractLookup> {
  const deadline = Date.now() + timeoutMs;
  let result = await getContract(reviewId, userId);
  while (result.status === "pending" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    result = await getContract(reviewId, userId);
  }
  return result;
}

export async function logEvent(e: {
  reviewId: string;
  userId: string;
  type: "checkpoint_ok" | "drift" | "breach" | "spend" | "approval";
  action: string;
  detail?: Record<string, unknown>;
}) {
  const { error } = await createAdminClient()
    .from("events")
    .insert({ review_id: e.reviewId, user_id: e.userId, type: e.type, action: e.action, detail: (e.detail ?? {}) as Json });
  if (error) throw error;
}
