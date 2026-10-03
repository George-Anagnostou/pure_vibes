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
  scale: 0.5,
  cost_vs_speed: 0.5,
  polish: 0.5,
  novelty: 0.5,
  autonomy: 0.5,
};
// budget_cap is off until the human sets a budget (the pop-up doesn't ask for one).
export const DEFAULT_HARD_LINES: HardLines = {
  no_unauthorized_access: true,
  no_deception: true,
  budget_cap: false,
  no_unapproved_contact: true,
};

// ---- Reveal (Claude call #1) ----
export const RevealedPrioritySchema = z.object({
  name: z
    .string()
    .describe("Short label, e.g. 'Scale', 'Speed', 'Cost', 'Get the answer'"),
  kind: z.enum(["core", "task_specific"]),
  evidence: z
    .string()
    .describe(
      "The concrete plan step that reveals this priority, quoted or paraphrased",
    ),
  confidence: z.number().min(0).max(1),
});
export const RevealSchema = z.object({
  priorities: z
    .array(RevealedPrioritySchema)
    .describe("Ranked, most-optimized-for first"),
  ignored: z
    .array(z.string())
    .describe("Core dimensions the plan gives no weight at all, e.g. 'Cost'"),
  dials: DialsSchema.describe("Where the plan as written sits on each dial"),
  est_cost: z.object({
    monthly_usd: z.number(),
    one_time_usd: z.number(),
    basis: z.string().describe("One line on what drives the cost"),
  }),
  headline: z
    .string()
    .describe(
      "One sentence a non-engineer understands: what this plan is really optimizing for",
    ),
});
export type Revealed = z.infer<typeof RevealSchema>;

// ---- The agent's plan, step by step: HOW it will do the task (planning-mode interview) ----
// Stored in reviews.stated. Older rows hold priorities ({name, why, source}) or plain strings.
export const StatedPrioritySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("Short step title, e.g. 'Get historical market returns'"),
  how: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe(
      "Exactly how you'll do it: the method, data source, endpoint or library, e.g. 'Download S&P 500 + AGG annual returns 1990-2025 from Yahoo Finance via yfinance'",
    ),
  uses: z
    .array(z.string().trim().max(80))
    .max(8)
    .optional()
    .describe(
      "Tools, APIs, data sources or services this step touches, e.g. ['WebFetch', 'yfinance', 'FRED API']",
    ),
  est_tokens: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Your honest estimate of model tokens this step will consume (input + output)",
    ),
  est_cost_usd: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Estimated dollars this step spends: model tokens plus any paid APIs or services",
    ),
  why: z
    .string()
    .trim()
    .max(300)
    .describe("One line: why this step / why this way"),
  source: z
    .enum(["request", "instructions", "rules", "judgment", "assumption"])
    .optional()
    .describe(
      "Why it's in the plan: request = the human asked; instructions = their instructions or project files (e.g. CLAUDE.md); rules = your guidelines or safety rules; judgment = your own default way of doing it; assumption = you assumed it without being told",
    ),
});
export type StatedPriority = z.infer<typeof StatedPrioritySchema>;

// ---- Suggestions: the only critique output the human sees ----
export const SuggestionSchema = z.object({
  action: z.enum(["add", "drop", "raise", "lower"]),
  ref: z
    .number()
    .int()
    .describe(
      "For drop/raise/lower: the number of the agent's priority in its numbered list (1 = first). For add: 0.",
    ),
  priority: z
    .string()
    .describe(
      "For add: a new short label. Otherwise: exactly the agent's priority name.",
    ),
  why: z
    .string()
    .describe(
      "One plain sentence addressed to the human, e.g. 'You didn't mention cost — a flight tomorrow could be half the price.'",
    ),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

// ---- Critique (call #2, independent; everything but suggestions stays under the hood) ----
export const CritiqueSchema = z.object({
  suggestions: z
    .array(SuggestionSchema)
    .describe("3-6 suggestions, most important first"),
  hard_line_risks: z.array(
    z.object({
      step: z.string().describe("The plan step at risk"),
      hard_line: z.enum([
        "no_unauthorized_access",
        "no_deception",
        "budget_cap",
        "no_unapproved_contact",
      ]),
      severity: z.enum(["warn", "block"]),
      explanation: z
        .string()
        .describe(
          "Plain English, e.g. \"'Get the answer' (#4) is overriding 'No unauthorized access'\"",
        ),
    }),
  ),
  stated_vs_revealed: z
    .string()
    .describe(
      'One line contrasting what the agent SAYS it prioritizes with what the plan DOES, e.g. "Agent says: cost matters. Plan does: 3 servers + caching (Scale)." If the agent stated no priorities, describe what the plan does.',
    ),
  verdict: z
    .enum(["green", "yellow", "red"])
    .describe(
      "green = fine, yellow = misaligned priorities, red = crosses a hard line",
    ),
  summary: z.string(),
});
export type Critique = z.infer<typeof CritiqueSchema>;

// ---- Contract (returned to the agent after human approval) ----
// One step of the approved plan, as the agent must now carry it out.
export type ApprovedStep = {
  step: number;
  name: string;
  how?: string;
  uses?: string[];
  est_tokens?: number;
  est_cost_usd?: number;
  added_by_human?: true; // typed in by the human or accepted from a Glass Box suggestion
};

export type Contract = {
  review_id: string;
  approved_steps: ApprovedStep[]; // the binding plan, in the human's order
  ranked_priorities: string[]; // the same step names, kept for older agents
  dials: Dials;
  hard_lines: string[]; // e.g. ["no_unauthorized_access", "budget_max_cents:2000"]
  budget_cents: number;
  added_by_human: string[]; // steps the human added
  removed_by_human: string[]; // agent steps the human deleted
  plan_guidance: string;
  instructions: string;
  message: string;
};

// ---- Approval payload (UI -> /api/reviews/[id]/approve) ----
// Only the ranking is required; dials/hard lines/budget fall back to the profile, then defaults.
export const ApprovalSchema = z.object({
  ranked_priorities: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  added_by_human: z.array(z.string()).optional(),
  removed_by_human: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
  dials: DialsSchema.optional(),
  hard_lines: z.record(z.string(), z.boolean()).optional(),
  budget_cents: z.number().int().min(0).optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export type ReviewStatus = "pending" | "approved" | "rejected" | "expired";
export type Review = {
  id: string;
  user_id: string;
  agent_name: string;
  task: string;
  plan: string;
  stated: StatedPriority[] | string[]; // the agent's own priorities, highest first (older rows: plain names)
  revealed: Revealed | null;
  critique: Critique | null;
  status: ReviewStatus;
  created_at: string;
  decided_at: string | null;
};

export type EventType =
  "checkpoint_ok" | "drift" | "breach" | "spend" | "approval";
export type GlassEvent = {
  id: string;
  review_id: string;
  type: EventType;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type CheckpointResult = {
  decision: "allow" | "warn" | "block";
  reason: string;
};
