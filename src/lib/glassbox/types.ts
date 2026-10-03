// Shared contract between the API (Nick) and the UI (Kathryn).
// Zod schemas double as the LLM structured-output schemas, so the UI types
// are exactly what Claude is forced to return.
import { z } from "zod";

// ---- Core dials: 0 = left label, 1 = right label ----
export const DIALS = {
  scale: { left: "Just me", right: "Millions of users" },
  cost_vs_speed: { left: "Cheapest", right: "Fastest" },
  polish: { left: "Good enough", right: "Polished" },
  novelty: { left: "Proven", right: "Cutting-edge" },
  autonomy: { left: "Just do it", right: "Check with me" },
} as const;
export type DialKey = keyof typeof DIALS;

export const DialsSchema = z.object({
  scale: z.number().min(0).max(1),
  cost_vs_speed: z.number().min(0).max(1),
  polish: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  autonomy: z.number().min(0).max(1),
});
export type Dials = z.infer<typeof DialsSchema>;

// ---- Hard lines ----
export const HARD_LINES = {
  no_unauthorized_access: "Never access anything without permission",
  no_deception: "Never deceive anyone",
  budget_cap: "Never spend over the budget",
  no_unapproved_contact: "Never contact anyone without asking",
} as const;
export type HardLineKey = keyof typeof HARD_LINES;
export type HardLines = Record<HardLineKey, boolean>;

export const DEFAULT_DIALS: Dials = {
  scale: 0.5, cost_vs_speed: 0.5, polish: 0.5, novelty: 0.5, autonomy: 0.5,
};
export const DEFAULT_HARD_LINES: HardLines = {
  no_unauthorized_access: true, no_deception: true, budget_cap: true, no_unapproved_contact: true,
};

// ---- Reveal (Claude call #1) ----
export const RevealedPrioritySchema = z.object({
  name: z.string().describe("Short label, e.g. 'Scale', 'Speed', 'Cost', 'Get the answer'"),
  kind: z.enum(["core", "task_specific"]),
  evidence: z.string().describe("The concrete plan step that reveals this priority, quoted or paraphrased"),
  confidence: z.number().min(0).max(1),
});
export const RevealSchema = z.object({
  priorities: z.array(RevealedPrioritySchema).describe("Ranked, most-optimized-for first"),
  ignored: z.array(z.string()).describe("Core dimensions the plan gives no weight at all, e.g. 'Cost'"),
  dials: DialsSchema.describe("Where the plan as written sits on each dial"),
  est_cost: z.object({
    monthly_usd: z.number(),
    one_time_usd: z.number(),
    basis: z.string().describe("One line on what drives the cost"),
  }),
  headline: z.string().describe("One sentence a non-engineer understands: what this plan is really optimizing for"),
});
export type Revealed = z.infer<typeof RevealSchema>;

// ---- Critique (Claude call #2, independent) ----
export const CritiqueSchema = z.object({
  missing_priorities: z.array(z.object({ name: z.string(), why: z.string() })),
  alternatives: z.array(z.object({
    ordering: z.array(z.string()).describe("Priority names, highest first"),
    biggest_change: z.string().describe("The single biggest change to the plan under this ordering"),
    est_monthly_usd: z.number(),
  })).describe("Exactly 2 alternative orderings"),
  hard_line_risks: z.array(z.object({
    step: z.string().describe("The plan step at risk"),
    hard_line: z.enum(["no_unauthorized_access", "no_deception", "budget_cap", "no_unapproved_contact"]),
    severity: z.enum(["warn", "block"]),
    explanation: z.string().describe("Plain English, e.g. \"'Get the answer' (#4) is overriding 'No unauthorized access'\""),
  })),
  stated_vs_revealed: z.string().describe("One line contrasting what the agent SAYS it prioritizes with what the plan DOES, e.g. \"Agent says: cost matters. Plan does: 3 servers + caching (Scale).\" If the agent stated no priorities, describe what the plan does."),
  verdict: z.enum(["green", "yellow", "red"]).describe("green = fine, yellow = misaligned priorities, red = crosses a hard line"),
  summary: z.string(),
});
export type Critique = z.infer<typeof CritiqueSchema>;

// ---- Contract (returned to the agent after human approval) ----
export type Contract = {
  review_id: string;
  ranked_priorities: string[];
  dials: Dials;
  hard_lines: string[]; // e.g. ["no_unauthorized_access", "budget_max_cents:2000"]
  budget_cents: number;
  added_by_human: string[]; // priorities the human added that the agent never considered
  plan_guidance: string;
  instructions: string;
  message: string;
};

// ---- Approval payload (UI -> /api/reviews/[id]/approve) ----
export const ApprovalSchema = z.object({
  ranked_priorities: z.array(z.string()).min(1),
  dials: DialsSchema,
  hard_lines: z.record(z.string(), z.boolean()),
  budget_cents: z.number().int().min(0),
  added_by_human: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export type ReviewStatus = "pending" | "approved" | "rejected" | "expired";
export type Review = {
  id: string;
  user_id: string;
  agent_name: string;
  task: string;
  plan: string;
  stated: string[]; // the agent's own ranked priorities, highest first
  revealed: Revealed | null;
  critique: Critique | null;
  status: ReviewStatus;
  created_at: string;
  decided_at: string | null;
};

export type EventType = "checkpoint_ok" | "drift" | "breach" | "spend" | "approval";
export type GlassEvent = {
  id: string;
  review_id: string;
  type: EventType;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type CheckpointResult = { decision: "allow" | "warn" | "block"; reason: string };
