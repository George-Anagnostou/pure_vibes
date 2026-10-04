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

// ---- Decisions: the judgment calls the agent is making on the human's behalf ----
// The heart of the interview: what the agent THINKS the human wants, and how it is
// weighing the trade-offs, so the human can correct it before it acts.
const OptionSchema = z.object({
  option: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe("A concrete alternative, e.g. '3-hospital proof of concept'"),
  tradeoff: z
    .string()
    .trim()
    .max(240)
    .describe(
      "What you gain and give up, e.g. 'Minutes instead of hours; proves the parsing works before scaling'",
    ),
});
export type DecisionOption = z.infer<typeof OptionSchema>;

export const DecisionSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .describe("Short label, e.g. 'Scope', 'Data source', 'Accuracy vs speed'"),
  question: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      "The decision as a question, e.g. 'How many hospitals do I scan?'",
    ),
  choice: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("What you're planning to do, e.g. 'All ~20 SF hospitals'"),
  thinks_you_want: z
    .string()
    .trim()
    .max(200)
    .describe(
      "What you believe the human wants that led to this choice, e.g. 'Complete coverage matters more than speed'",
    ),
  why: z
    .string()
    .trim()
    .max(300)
    .describe(
      "How you weighed it: the reasoning and evidence behind the choice",
    ),
  alternatives: z
    .array(OptionSchema)
    .min(1)
    .max(3)
    .describe("The real alternatives you considered"),
  est_tokens: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Model tokens your choice will consume"),
  est_cost_usd: z
    .number()
    .min(0)
    .optional()
    .describe("Dollars your choice will spend (tokens + paid services)"),
  est_time: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("Rough time your choice takes, e.g. '2 hours', '5 min'"),
  source: z
    .enum(["request", "instructions", "rules", "judgment", "assumption"])
    .optional()
    .describe(
      "request = the human said so; instructions = their instructions or project files; rules = your guidelines; judgment = your own default; assumption = you guessed",
    ),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ---- Suggestions: Glass Box's advice on the decisions (the only critique the human sees) ----
export const SuggestionSchema = z.object({
  action: z
    .enum([
      "challenge",
      "add",
      "add_priority",
      "drop_priority",
      "raise_priority",
      "lower_priority",
    ])
    .describe(
      "Decisions: challenge = the agent's choice on an existing decision is likely wrong for this person; add = a decision the agent is making implicitly and didn't list. Priorities: add_priority = something this person likely cares about that the agent isn't weighing; drop/raise/lower_priority = an agent priority that should go, or be ranked higher/lower",
    ),
  ref: z
    .number()
    .int()
    .describe(
      "challenge: the decision's number (1 = first). drop/raise/lower_priority: the priority's number. add / add_priority: 0.",
    ),
  topic: z
    .string()
    .describe(
      "For challenge: copy the decision's topic. For add: a short new topic.",
    ),
  question: z
    .string()
    .describe("For add: the decision as a question. For challenge: copy it."),
  recommend: z.string().describe("The option you'd recommend for this person"),
  options: z
    .array(OptionSchema)
    .max(3)
    .describe(
      "For add: 2-3 options including the one the agent will likely default to. For challenge: [] (or one new option if your recommendation isn't among the agent's alternatives).",
    ),
  why: z
    .string()
    .describe(
      "One short sentence to the human: why this person probably wants something different",
    ),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

// ---- Challenges: real-world situations that force the agent to choose between its priorities ----
export const ChallengeSchema = z.object({
  id: z.string().describe("c1, c2, …"),
  scenario: z
    .string()
    .describe(
      "A concrete, realistic situation the agent is likely to hit on THIS task, with specifics (numbers, times, names), ending in a question, e.g. 'Your top pick only has 9:45pm or bar seats; a good second choice has 7:30. Which do you book?'",
    ),
  priority_numbers: z
    .array(z.number().int())
    .describe(
      "The NUMBERS (as in the numbered AGENT'S PRIORITIES list) of the two agent priorities this pits against each other, e.g. [2, 5]. Must be two different numbers from that list.",
    ),
  tests: z
    .array(z.string())
    .describe(
      "The names of those same two priorities, copied exactly from the list at those numbers (e.g. ['Food quality', 'Fit your schedule'])",
    ),
  why_it_matters: z
    .string()
    .describe("One line to the human: why their answer here matters"),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

// The agent's answer to one challenge (sent with the answer_challenges tool).
export const ChallengeAnswerSchema = z.object({
  id: z.string().trim().min(1).max(10).describe("The challenge id, e.g. 'c1'"),
  response: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe("Exactly what you'd do in this situation, concretely"),
  favors: z
    .string()
    .trim()
    .max(120)
    .describe(
      "Which of the two priorities wins in your answer (copy its name), or 'ask the human'",
    ),
  would_ask_human: z
    .boolean()
    .describe("Would you stop and ask the human before acting here?"),
});
export type ChallengeAnswer = z.infer<typeof ChallengeAnswerSchema>;

// The human's ruling on one challenge.
export const ChallengeRulingSchema = z.object({
  id: z.string().trim().min(1).max(10),
  scenario: z.string().trim().max(600),
  agent_response: z.string().trim().max(600),
  approved: z.boolean(),
  instead: z.string().trim().max(600).optional(),
});
export type ChallengeRuling = z.infer<typeof ChallengeRulingSchema>;

// ---- Critique (call #2, independent; everything but suggestions stays under the hood) ----
// No challenges any more (the agent no longer answers an interview before the human
// sees the review); older rows may still carry critique.challenges, hence the optional field.
export const CritiqueSchema = z.object({
  suggestions: z
    .array(SuggestionSchema)
    .describe("2-5 suggestions, most important first"),
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
export type Critique = z.infer<typeof CritiqueSchema> & {
  challenges?: Challenge[]; // older rows only
};

// ---- Contract (returned to the agent after the human decides) ----
export type ContractDecision = {
  topic: string;
  question: string;
  decision: string; // what the agent must do
  changed_by_human: boolean;
  your_original_choice?: string;
};

export type Contract = {
  review_id: string;
  ranked_priorities: string[]; // what to weigh, in the human's order (highest first)
  added_priorities: string[]; // priorities the human added
  removed_priorities: string[]; // agent priorities the human deleted: don't optimize for these
  decisions: ContractDecision[];
  // How to handle situations Glass Box tested: do_this is binding when it comes up.
  situations: {
    situation: string;
    do_this: string;
    human_overrode_you: boolean;
  }[];
  instructions_from_human: string[]; // free-text steps/instructions the human typed
  plan_guidance: string;
  hard_lines: string[]; // e.g. ["no_unauthorized_access", "budget_max_cents:2000"]
  budget_cents: number;
  dials: Dials;
  instructions: string;
  message: string;
};

// ---- Approval payload (UI -> /api/reviews/[id]/approve) ----
// Only the ranking is required; dials/hard lines/budget fall back to the profile, then defaults.
// The human's final answer on one decision.
export const DecisionAnswerSchema = z.object({
  topic: z.string().trim().min(1).max(60),
  question: z.string().trim().max(200),
  answer: z.string().trim().min(1).max(300),
  agent_choice: z.string().trim().max(200).optional(), // absent for decisions the agent never listed
  changed: z.boolean(),
});
export type DecisionAnswer = z.infer<typeof DecisionAnswerSchema>;

export const ApprovalSchema = z.object({
  decisions: z.array(DecisionAnswerSchema).max(20).optional(),
  challenges: z.array(ChallengeRulingSchema).max(10).optional(),
  instructions: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  ranked_priorities: z
    .array(z.string().trim().min(1).max(300))
    .min(1)
    .max(20)
    .optional(),
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
