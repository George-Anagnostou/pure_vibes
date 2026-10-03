import type { ChallengeRuling } from "@/lib/glassbox/types";
import type { Json } from "@/types/database";

// approve_review RPC args (minus challenges), as the session client sends them.
export type ApproveArgs = {
  p_review_id: string;
  p_ranked_priorities: Json;
  p_dials: Json;
  p_hard_lines: Json;
  p_budget_cents: number;
  p_plan_guidance: string;
  p_notes: string | null;
  p_added_by_human: Json;
  p_removed_by_human: Json;
  p_decisions: Json;
};

type DbError = { code?: string; message?: string } | null;
type Rpc = (
  args: ApproveArgs & { p_challenges?: Json },
) => PromiseLike<{ data: string | null; error: DbError }>;
type WriteChallenges = (
  challenges: ChallengeRuling[],
) => PromiseLike<{ error: DbError }>;

// PostgREST can't find approve_review with p_challenges: the migration that adds it
// (20261003270000_approve_review_challenges) hasn't been applied yet.
export const isMissingFunction = (e: DbError) =>
  !!e &&
  (e.code === "PGRST202" ||
    /function .* does not exist|could not find the function/i.test(
      e.message ?? "",
    ));

// Approve the review, create the contract and store the challenge rulings atomically.
// Before the migration is applied, falls back to the old two-step write (contract,
// then rulings via the admin client), which has a brief window where get_contract
// sees situations: [].
export async function approveReview(
  rpc: Rpc,
  writeChallenges: WriteChallenges,
  args: ApproveArgs,
  challenges: ChallengeRuling[] = [],
): Promise<{ contractId: string | null; error: DbError }> {
  if (!challenges.length) {
    const { data, error } = await rpc(args);
    return { contractId: data, error };
  }
  const first = await rpc({ ...args, p_challenges: challenges as Json });
  if (!isMissingFunction(first.error))
    return { contractId: first.data, error: first.error };

  console.warn(
    "[glassbox] approve_review(p_challenges) missing; apply migration 20261003270000. Using two-step write.",
  );
  const { data, error } = await rpc(args);
  if (error) return { contractId: null, error };
  const { error: chErr } = await writeChallenges(challenges);
  return { contractId: data, error: chErr };
}
