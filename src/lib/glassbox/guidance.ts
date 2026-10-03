import { DIALS, HARD_LINES, type Approval } from "@/lib/glassbox/types";

// Pure prompt construction for plan guidance (no model calls), so it can be unit-tested.
// The rule: guidance may only lead with what the human ACTUALLY changed. Defaults the
// approve route filled in (dials, hard lines, budget) are never presented as the human's.

export type ResolvedApproval = Approval &
  Required<Pick<Approval, "dials" | "hard_lines" | "budget_cents">>;

export type GuidanceOptions = {
  dialsSet?: boolean; // the request carried dials
  hardLinesSet?: boolean; // the request carried hard_lines
  agentPriorities?: string[]; // the agent's own ranking, to detect re-ordering
};

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// The human's order differs from the agent's, ignoring added/removed items.
export function priorityOrderChanged(
  agent: string[],
  human: string[],
): boolean {
  const kept = agent.filter((a) => human.some((h) => same(a, h)));
  const original = human.filter((h) => agent.some((a) => same(a, h)));
  return (
    kept.length === original.length &&
    kept.some((k, i) => !same(k, original[i]))
  );
}

// Every change the human made, one line each, most structural first.
export function humanChanges(
  approval: ResolvedApproval,
  {
    dialsSet = false,
    hardLinesSet = false,
    agentPriorities = [],
  }: GuidanceOptions = {},
): string[] {
  const out: string[] = [];
  const ranked = approval.ranked_priorities ?? [];
  if (ranked.length && priorityOrderChanged(agentPriorities, ranked))
    out.push(
      `Re-ranked priorities (first wins): ${ranked.join(" > ")} (the agent had: ${agentPriorities.join(" > ")})`,
    );
  if (approval.added_by_human?.length)
    out.push(`Added priorities: ${approval.added_by_human.join(", ")}`);
  if (approval.removed_by_human?.length)
    out.push(
      `Removed priorities (don't optimize for these): ${approval.removed_by_human.join(", ")}`,
    );
  for (const d of approval.decisions ?? [])
    if (d.changed)
      out.push(
        `Decision "${d.topic}": ${d.answer}${d.agent_choice ? ` (instead of the agent's choice: ${d.agent_choice})` : " (the agent hadn't considered this)"}`,
      );
  for (const c of approval.challenges ?? [])
    if (!c.approved && c.instead?.trim())
      out.push(
        `Situation overruled: "${c.scenario}" -> do this instead: ${c.instead.trim()}${c.agent_response ? ` (the agent had said: ${c.agent_response})` : ""}`,
      );
  for (const t of approval.instructions ?? []) out.push(`Instruction: ${t}`);
  if (approval.notes?.trim()) out.push(`Note: ${approval.notes.trim()}`);
  if (hardLinesSet) {
    const lines = Object.entries(approval.hard_lines)
      .filter(([, on]) => on)
      .map(([k]) => HARD_LINES[k as keyof typeof HARD_LINES] ?? k);
    if (lines.length)
      out.push(
        `Hard lines: ${lines.join("; ")}${approval.hard_lines.budget_cap ? ` (budget $${(approval.budget_cents / 100).toFixed(2)})` : ""}`,
      );
  }
  if (dialsSet)
    out.push(
      `Dials: ${Object.entries(approval.dials)
        .map(([k, v]) => {
          const d = DIALS[k as keyof typeof DIALS];
          return `${k} ${v.toFixed(2)} (0 = ${d.left}, 1 = ${d.right})`;
        })
        .join("; ")}`,
    );
  return out;
}

export const NO_CHANGES_GUIDANCE =
  "The human approved your approach with no changes. Proceed as planned and follow the contract.";

// Deterministic guidance when there is nothing to phrase, or the model is unavailable.
export function fallbackGuidance(changes: string[]): string {
  if (!changes.length) return NO_CHANGES_GUIDANCE;
  return `Follow the human's changes exactly: ${changes.join(". ")}. No other changes.`;
}

export const GUIDANCE_SYSTEM =
  'You tell an AI agent how to proceed now that the human has reviewed the approach it was about to take on their behalf. Output 2-4 short imperative sentences the agent must follow. Lead strictly with the items under CHANGES BY THE HUMAN, in that order: what to do differently, what not to do, what to show or check with the human. Never present anything else as a change, and never invent restrictions, hard lines or limits the human didn\'t list there. End with exactly: "No other changes." Be concrete to the task. No preamble.';

export function buildGuidancePrompt(
  quoted: string,
  approval: ResolvedApproval,
  options: GuidanceOptions = {},
): { changes: string[]; prompt: string } {
  const changes = humanChanges(approval, options);
  const kept = (approval.decisions ?? []).filter((d) => !d.changed);
  const context = [
    approval.ranked_priorities?.length
      ? `Final priority order (first wins): ${approval.ranked_priorities.join(" > ")}`
      : "",
    kept.length
      ? `Decisions the human kept as the agent proposed: ${kept.map((d) => `${d.topic}: ${d.answer}`).join("; ")}`
      : "",
  ].filter(Boolean);
  const prompt = `${quoted}\n\nCHANGES BY THE HUMAN (lead with these, in order):\n${changes.map((c) => `- ${c}`).join("\n")}${context.length ? `\n\nUNCHANGED (context only; do not present as changes):\n${context.map((c) => `- ${c}`).join("\n")}` : ""}`;
  return { changes, prompt };
}
