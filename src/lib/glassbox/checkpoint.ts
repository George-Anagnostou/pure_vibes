import { getContract, logEvent } from "@/lib/glassbox/reviews";
import {
  HARD_LINES,
  type CheckpointResult,
  type HardLineKey,
} from "@/lib/glassbox/types";

// Deterministic execution-time rules engine. No LLM, no I/O: the same input
// always produces the same decision, instantly. Order matters: hard-line
// blocks first, then the budget warning, then priority drift, else allow.

export type CheckpointInput = {
  action: string;
  target: string;
  details?: Record<string, unknown>;
};

export type CheckpointRules = {
  // Either the stored jsonb object ({no_deception: true, ...}) or the agent-facing
  // Contract list (["no_deception", "budget_max_cents:2000"]).
  hard_lines: Record<string, boolean> | string[];
  ranked_priorities: string[];
};

export type CheckpointDecision = CheckpointResult & { hard_line?: HardLineKey };

const HARD_LINE_ORDER = Object.keys(HARD_LINES) as HardLineKey[];

function enabledLines(
  hardLines: CheckpointRules["hard_lines"],
): Set<HardLineKey> {
  const on = new Set<HardLineKey>();
  if (Array.isArray(hardLines)) {
    for (const entry of hardLines) {
      if (entry.startsWith("budget_max_cents:")) on.add("budget_cap");
      else if (entry in HARD_LINES) on.add(entry as HardLineKey);
    }
  } else {
    for (const key of HARD_LINE_ORDER) if (hardLines[key] === true) on.add(key);
  }
  return on;
}

function hardLineLabel(key: HardLineKey) {
  return `'${HARD_LINES[key]}' (#${HARD_LINE_ORDER.indexOf(key) + 1} hard line)`;
}

const UNAUTHORIZED: { re: RegExp; why: string; priority?: string }[] = [
  {
    re: /answer[\s_-]?key/,
    why: "is restricted to instructors",
    priority: "Get the answer",
  },
  {
    re: /instructors?[\s_-]?only/,
    why: "is restricted to instructors",
    priority: "Get the answer",
  },
  { re: /\badmin(istrator)?\b/, why: "is an admin-only resource" },
  {
    re: /(login|auth(entication)?)[\s_-]?bypass|bypass(ing)?[\s_-]+(the[\s_-]+)?(login|auth)/,
    why: "would bypass a login",
  },
  {
    re: /password[\s_-]?(guess|spray|brute)|guess(ing)?[\s_-]+(the[\s_-]+)?password|brute[\s_-]?forc/,
    why: "involves guessing passwords",
  },
  { re: /credential/, why: "involves credentials the agent was not given" },
  {
    re: /(forged|stolen|fake|spoofed|hijack(ed)?)[\s_-]+(cookie|session|token)/,
    why: "uses a forged or stolen session",
  },
];

const DECEPTION =
  /impersonat|fake[\s_-]+(identity|account|persona|name|review)|pos(e|ing)[\s_-]+as\b|pretend(ing)?[\s_-]+to[\s_-]+be|as[\s_-]+(my|our|its)[\s_-]+own[\s_-]+work|misrepresent|plagiari/;

const CONTACT_ACTION =
  /^(e-?mail|sms|text|message|dm|call|phone|tweet|post|send[\s_-]?(e-?mail|sms|message|text)|contact|reach[\s_-]?out)$/;
const EMAIL = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/;
const isPhone = (t: string) =>
  /^\+?[\d\s().-]+$/.test(t) && t.replace(/\D/g, "").length >= 7;

const SPEND =
  /\b(buy|purchase|pay|payment|checkout|subscribe|spend|charge|order|upgrade[\s_-]+plan)\b/;

const DRIFT: { priority: RegExp; action: RegExp; why: string }[] = [
  {
    priority: /cost|cheap|budget|frugal|money/,
    action:
      /load[\s_-]?balancer|\balb\b|redis|elasticache|kubernetes|\bk8s\b|\beks\b|\becs\b|\brds\b|multi-?az|auto-?scal|\bgpu\b|dedicated[\s_-]+(server|instance)/,
    why: "provisions paid infrastructure",
  },
  {
    priority: /simpl|minimal|lean/,
    action:
      /microservice|kubernetes|\bk8s\b|service[\s_-]?mesh|event[\s_-]?bus|queue/,
    why: "adds architectural complexity",
  },
  {
    priority: /speed|fast|ship|quick/,
    action:
      /rewrite|refactor[\s_-]+(everything|all)|migrate[\s_-]+(the[\s_-]+)?(whole|entire)/,
    why: "is a large detour before shipping",
  },
];

export function evaluateCheckpoint(
  input: CheckpointInput,
  rules: CheckpointRules,
): CheckpointDecision {
  const on = enabledLines(rules.hard_lines);
  const details = input.details ?? {};
  const action = input.action.trim().toLowerCase();
  const target = input.target.trim();
  const text = `${action} ${target} ${JSON.stringify(details)}`.toLowerCase();
  const claimed =
    typeof details.agent_priority === "string"
      ? details.agent_priority
      : undefined;

  const block = (
    key: HardLineKey,
    priority: string,
    specifics: string,
  ): CheckpointDecision => ({
    decision: "block",
    hard_line: key,
    reason: `Blocked: '${claimed ?? priority}' is overriding ${hardLineLabel(key)}. ${specifics}`,
  });

  if (on.has("no_unauthorized_access") && details.authorized !== true) {
    const hit = UNAUTHORIZED.find((r) => r.re.test(text));
    if (hit)
      return block(
        "no_unauthorized_access",
        hit.priority ?? "Get it done",
        `Target ${target} ${hit.why}.`,
      );
    const restricted =
      details.restricted === true ||
      /\b(restricted|unauthori[sz]ed|not authori[sz]ed|without permission|lacks? permission|no permission|forbidden)\b/.test(
        text,
      );
    if (restricted) {
      return block(
        "no_unauthorized_access",
        "Get it done",
        `Target ${target} is restricted and the agent has no permission to access it.`,
      );
    }
  }

  if (on.has("no_deception") && DECEPTION.test(text)) {
    return block(
      "no_deception",
      "Look successful",
      `Action '${input.action}' on ${target} would misrepresent who did the work or who is acting.`,
    );
  }

  if (on.has("no_unapproved_contact") && details.approved !== true) {
    const personTarget =
      EMAIL.test(target) || isPhone(target) || /^@\w+/.test(target);
    if (personTarget || (CONTACT_ACTION.test(action) && action !== "post")) {
      return block(
        "no_unapproved_contact",
        "Get it done",
        `Contacting ${target} needs the human's approval first (resend with details.approved = true only after they say yes).`,
      );
    }
  }

  if (
    on.has("budget_cap") &&
    (SPEND.test(action) || typeof details.amount_cents === "number")
  ) {
    return {
      decision: "warn",
      hard_line: "budget_cap",
      reason: `Warning: ${hardLineLabel("budget_cap")} applies. Do not pay for '${target}' directly; call request_spend with the amount so the budget is enforced.`,
    };
  }

  const top = rules.ranked_priorities[0];
  if (top) {
    const drift = DRIFT.find(
      (d) => d.priority.test(top.toLowerCase()) && d.action.test(text),
    );
    if (drift) {
      return {
        decision: "warn",
        reason: `Drift: '${input.action} ${target}' ${drift.why}, which works against '${top}', the human's #1 priority. Reconsider or ask first.`,
      };
    }
  }

  return {
    decision: "allow",
    reason: `Allowed: '${input.action} ${target}' is within the approved contract.`,
  };
}

const EVENT_TYPE = {
  allow: "checkpoint_ok",
  warn: "drift",
  block: "breach",
} as const;

// Loads the approved contract for this agent's review, evaluates, and logs the
// outcome to the events feed (allow -> checkpoint_ok, warn -> drift, block -> breach).
export async function runCheckpoint(
  reviewId: string,
  userId: string,
  input: CheckpointInput,
): Promise<CheckpointDecision> {
  const lookup = await getContract(reviewId, userId);
  if (lookup.status !== "approved") {
    return {
      decision: "block",
      reason: "No approved contract — call align first",
    };
  }
  // The human's decisions stand in for ranked priorities (first = most weight).
  const result = evaluateCheckpoint(input, {
    hard_lines: lookup.contract.hard_lines,
    ranked_priorities: lookup.contract.decisions.map((d) => `${d.topic}: ${d.decision}`),
  });
  await logEvent({
    reviewId,
    userId,
    type: EVENT_TYPE[result.decision],
    action: `${input.action} ${input.target}`.slice(0, 300),
    detail: {
      target: input.target,
      decision: result.decision,
      hard_line: result.hard_line ?? null,
      reason: result.reason,
    },
  });
  return result;
}
