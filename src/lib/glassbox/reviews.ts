import "server-only";
import { appUrl } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { revealAndCritique } from "@/lib/glassbox/llm";
import type {
  Contract,
  Critique,
  Decision,
  DecisionAnswer,
  Dials,
  Revealed,
  ReviewStatus,
  StatedPriority,
} from "@/lib/glassbox/types";
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
  plan?: string; // the agent's overall approach
  priorities?: StatedPriority[]; // what it's weighing, highest first
  decisions?: Decision[];
}): Promise<ReviewResult> {
  const decisions = input.decisions ?? [];
  const priorities = input.priorities ?? [];
  const { revealed, critique } = await revealAndCritique({
    task: input.task,
    plan: input.plan,
    stated: decisions,
    priorities,
  });
  const { data, error } = await createAdminClient()
    .from("reviews")
    .insert({
      user_id: input.userId,
      agent_name: input.agentName,
      task: input.task,
      plan: input.plan?.trim() || "(no approach given)",
      stated: decisions as unknown as Json,
      priorities: priorities as unknown as Json,
      revealed: revealed as unknown as Json,
      critique: critique as unknown as Json,
    })
    .select("id")
    .single();
  if (error) throw error;
  return {
    review_id: data.id,
    align_url: alignUrl(data.id),
    revealed,
    critique,
  };
}

export const CONTRACT_INSTRUCTIONS =
  "This is binding: the human decided, not you. Weigh trade-offs in the order of ranked_priorities (first wins), never optimize for anything in removed_priorities, and treat added_priorities as requirements. For every decision, do what `decision` says, especially the ones marked changed_by_human, and drop your original choice. Follow plan_guidance and every entry in instructions_from_human. If a new decision comes up that the human hasn't made, or your approach changes, call align again rather than guessing. Call checkpoint before spending, deleting, contacting anyone, or accessing anything new, and never perform an action checkpoint blocks.";

// "Priorities: Cost > Accuracy > Speed (added Cost; removed Completeness). Changed 2 of 6 decisions: …"
export function describeDecisions(
  decisions: DecisionAnswer[],
  instructions: string[],
  priorities: { ranked: string[]; added: string[]; removed: string[] } = {
    ranked: [],
    added: [],
    removed: [],
  },
) {
  const parts: string[] = [];
  if (priorities.ranked.length) {
    const edits = [
      priorities.added.length ? `added ${priorities.added.join(", ")}` : "",
      priorities.removed.length
        ? `removed ${priorities.removed.join(", ")}`
        : "",
    ].filter(Boolean);
    parts.push(
      `The human ranked your priorities: ${priorities.ranked.join(" > ")}${edits.length ? ` (${edits.join("; ")})` : ""}.`,
    );
  }
  const changed = decisions.filter((d) => d.changed);
  if (decisions.length)
    parts.push(
      changed.length
        ? `The human changed ${changed.length} of ${decisions.length} decisions: ${changed
            .map((d) => `${d.topic} → ${d.answer}`)
            .join("; ")}.`
        : `The human kept all ${decisions.length} of your decisions.`,
    );
  if (instructions.length)
    parts.push(`They also told you: ${instructions.join("; ")}.`);
  return parts.join(" ");
}

export function toContract(row: ContractRow): Contract {
  const hardLines = row.hard_lines as Record<string, boolean>;
  const answers = (row.decisions as DecisionAnswer[] | null) ?? [];
  const decisions = answers.map((d) => ({
    topic: d.topic,
    question: d.question,
    decision: d.answer,
    changed_by_human: d.changed,
    ...(d.changed && d.agent_choice
      ? { your_original_choice: d.agent_choice }
      : {}),
  }));
  // Typed instructions are stored one per line in notes.
  const instructions = (row.notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Older contracts stored "Topic: answer" lines as the ranking when there were no priorities.
  const ranked = ((row.ranked_priorities as string[] | null) ?? []).filter(
    (r) => !answers.some((d) => r === `${d.topic}: ${d.answer}`),
  );
  const added = (row.added_by_human as string[] | null) ?? [];
  const removed = (row.removed_by_human as string[] | null) ?? [];
  const lines = Object.entries(hardLines)
    .filter(([, on]) => on)
    .map(([k]) =>
      k === "budget_cap" ? `budget_max_cents:${row.budget_cents}` : k,
    );
  return {
    review_id: row.review_id,
    ranked_priorities: ranked,
    added_priorities: added,
    removed_priorities: removed,
    decisions,
    instructions_from_human: instructions,
    plan_guidance: row.plan_guidance ?? "",
    hard_lines: lines,
    budget_cents: row.budget_cents,
    dials: row.dials as Dials,
    instructions: CONTRACT_INSTRUCTIONS,
    message: describeDecisions(answers, instructions, {
      ranked,
      added,
      removed,
    }),
  };
}

export type ContractLookup =
  | { status: "approved"; contract: Contract }
  | { status: Exclude<ReviewStatus, "approved">; align_url: string };

export async function getContract(
  reviewId: string,
  userId: string,
): Promise<ContractLookup> {
  const admin = createAdminClient();
  const { data: review, error } = await admin
    .from("reviews")
    .select("id, status")
    .eq("id", reviewId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!review) throw new HttpError(404, "Review not found.");
  if (review.status !== "approved") {
    return {
      status: review.status as Exclude<ReviewStatus, "approved">,
      align_url: alignUrl(reviewId),
    };
  }
  const { data: row, error: cErr } = await admin
    .from("contracts")
    .select("*")
    .eq("review_id", reviewId)
    .single();
  if (cErr) throw cErr;
  return {
    status: "approved",
    contract: toContract(row),
  };
}

// Poll until the human decides or the deadline (epoch ms) passes. Callers pick a
// deadline under their function limit; agents fall back to get_contract when pending.
export async function waitForContract(
  reviewId: string,
  userId: string,
  deadline: number,
): Promise<ContractLookup> {
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
    .insert({
      review_id: e.reviewId,
      user_id: e.userId,
      type: e.type,
      action: e.action,
      detail: (e.detail ?? {}) as Json,
    });
  if (error) throw error;
}
