import "server-only";
import { appUrl } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { revealAndCritique } from "@/lib/glassbox/llm";
import type { Contract, Critique, Dials, Revealed, ReviewStatus } from "@/lib/glassbox/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContractRow, Json } from "@/types/database";

// Server-side review lifecycle shared by the HTTP API and the MCP server.
// All calls here use the admin client, so callers MUST have authenticated the
// agent (requireAgent) and pass its owning userId.

export type ReviewResult = {
  review_id: string;
  align_url: string;
  revealed: Revealed;
  critique: Critique;
};

export const alignUrl = (reviewId: string) => `${appUrl()}/align/${reviewId}`;

export async function createReview(input: {
  userId: string;
  agentName: string;
  task: string;
  plan: string;
  stated?: string[];
}): Promise<ReviewResult> {
  const stated = input.stated ?? [];
  const { revealed, critique } = await revealAndCritique({ task: input.task, plan: input.plan, stated });
  const { data, error } = await createAdminClient()
    .from("reviews")
    .insert({
      user_id: input.userId,
      agent_name: input.agentName,
      task: input.task,
      plan: input.plan,
      stated: stated as unknown as Json,
      revealed: revealed as unknown as Json,
      critique: critique as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { review_id: data.id, align_url: alignUrl(data.id), revealed, critique };
}

export const CONTRACT_INSTRUCTIONS =
  "Treat this priority order as binding: when priorities conflict, the higher one wins. Follow plan_guidance. If your plan changes materially, call align again. Call checkpoint before spending, deleting, contacting anyone, or accessing anything new, and never perform an action checkpoint blocks.";

// "Human moved Cost to #1 and Scale to last; added Security." — compares the
// human's ranking with what the plan was revealed to optimize for.
export function describeChanges(ranked: string[], revealedOrder: string[], added: string[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  const before = revealedOrder.map(norm);
  const parts: string[] = [];
  const top = ranked[0];
  if (top && before[0] !== norm(top)) parts.push(`moved ${top} to #1`);
  const formerTop = revealedOrder[0];
  if (formerTop) {
    const at = ranked.findIndex((r) => norm(r) === norm(formerTop));
    if (at === -1) parts.push(`dropped ${formerTop}`);
    else if (at === ranked.length - 1 && ranked.length > 1) parts.push(`${formerTop} to last`);
    else if (at > 0) parts.push(`${formerTop} to #${at + 1}`);
  }
  const moves = parts.length ? `Human ${parts.join(" and ")}` : "Human kept the plan's priority order";
  return `${moves}${added.length ? `; added ${added.join(", ")}` : ""}.`;
}

export function toContract(row: ContractRow, revealedOrder: string[] = []): Contract {
  const hardLines = row.hard_lines as Record<string, boolean>;
  const ranked = row.ranked_priorities as string[];
  const added = (row.added_by_human as string[] | null) ?? [];
  const lines = Object.entries(hardLines)
    .filter(([, on]) => on)
    .map(([k]) => (k === "budget_cap" ? `budget_max_cents:${row.budget_cents}` : k));
  return {
    review_id: row.review_id,
    ranked_priorities: ranked,
    dials: row.dials as Dials,
    hard_lines: lines,
    budget_cents: row.budget_cents,
    added_by_human: added,
    plan_guidance: row.plan_guidance ?? "",
    instructions: CONTRACT_INSTRUCTIONS,
    message: `${describeChanges(ranked, revealedOrder, added)}${row.notes ? ` Note: ${row.notes}` : ""}`,
  };
}

export type ContractLookup =
  | { status: "approved"; contract: Contract }
  | { status: Exclude<ReviewStatus, "approved">; align_url: string };

export async function getContract(reviewId: string, userId: string): Promise<ContractLookup> {
  const admin = createAdminClient();
  const { data: review, error } = await admin
    .from("reviews")
    .select("id, status, revealed")
    .eq("id", reviewId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new HttpError(404, "Review not found.");
  if (review.status !== "approved") {
    return { status: review.status as Exclude<ReviewStatus, "approved">, align_url: alignUrl(reviewId) };
  }
  const { data: row, error: cErr } = await admin.from("contracts").select("*").eq("review_id", reviewId).single();
  if (cErr) throw cErr;
  const order = ((review.revealed as unknown as Revealed | null)?.priorities ?? []).map((p) => p.name);
  return { status: "approved", contract: toContract(row, order) };
}

// Poll until the human decides or the deadline (epoch ms) passes. Callers pick a
// deadline under their function limit; agents fall back to get_contract when pending.
export async function waitForContract(reviewId: string, userId: string, deadline: number): Promise<ContractLookup> {
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
