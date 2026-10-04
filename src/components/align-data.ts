import type { Json } from "@/types/database";

// Defensive readers for review/contract jsonb -> UI shapes. They accept both
// the current contract and older rows, so a review never fails to render.

export const SOURCE_LABEL: Record<string, string> = {
  request: "Your request",
  instructions: "Your instructions",
  rules: "Its rules",
  judgment: "Its judgment",
  assumption: "Assumption",
};

export type StatedPriority = {
  name: string;
  why: string;
  source?: string;
  how?: string;
  uses?: string[];
  estTokens?: number;
  estCostUsd?: number;
};

const num = (v: Json | undefined) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
export type SuggestionAction = "add" | "drop" | "raise" | "lower";
export type Suggestion = {
  action: SuggestionAction;
  priority: string;
  why: string;
};

// Minimal review shape the align UI needs (matches a reviews row).
export type AlignReview = {
  id: string;
  agent_name: string;
  task: string;
  plan?: string | null;
  status: string;
  stated: Json;
  priorities?: Json;
  understanding?: string | null;
  challenge_answers?: Json;
  answered_at?: string | null;
  critique: Json | null;
  created_at: string;
};

type JsonObject = { [k: string]: Json | undefined };
const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: Json | undefined) => (typeof v === "string" ? v.trim() : "");

// review.stated: {name, why}[] (current) or string[] (older rows).
export function readStated(value: Json | undefined): StatedPriority[] {
  if (!Array.isArray(value)) return [];
  const out: StatedPriority[] = [];
  for (const entry of value) {
    const item =
      typeof entry === "string"
        ? { name: entry.trim(), why: "" }
        : isObject(entry)
          ? {
              name: str(entry.name),
              why: str(entry.why),
              source: SOURCE_LABEL[str(entry.source)],
              how: str(entry.how) || undefined,
              uses: readStrings(entry.uses),
              estTokens: num(entry.est_tokens),
              estCostUsd: num(entry.est_cost_usd),
            }
          : null;
    if (item?.name && !out.some((o) => samePriority(o.name, item.name)))
      out.push(item);
  }
  return out;
}

const ACTIONS: SuggestionAction[] = ["add", "drop", "raise", "lower"];

// critique.suggestions (current); older rows only had missing_priorities.
export function readSuggestions(critique: Json | null): Suggestion[] {
  if (!isObject(critique)) return [];
  const raw = critique.suggestions;
  if (Array.isArray(raw)) {
    return raw.flatMap((s) => {
      if (!isObject(s)) return [];
      const action = str(s.action) as SuggestionAction;
      const priority = str(s.priority);
      if (!ACTIONS.includes(action) || !priority) return [];
      return [{ action, priority, why: str(s.why) }];
    });
  }
  const missing = critique.missing_priorities;
  if (!Array.isArray(missing)) return [];
  return missing.flatMap((m) =>
    isObject(m) && str(m.name)
      ? [{ action: "add" as const, priority: str(m.name), why: str(m.why) }]
      : [],
  );
}

export function readStrings(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "Price" ~ "price", "Airline" ~ "Airline choice". Exact after normalizing,
// or one name contains the other as whole words.
export function samePriority(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && ` ${long} `.includes(` ${short} `);
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for you",
  approved: "Sent",
  rejected: "Rejected",
  expired: "Expired",
};

// ---- Decisions (current interview) ----

export type UiOption = { option: string; tradeoff: string };
export type UiDecision = {
  topic: string;
  question: string;
  choice: string;
  thinksYouWant: string;
  why: string;
  alternatives: UiOption[];
  estTokens?: number;
  estCostUsd?: number;
  estTime?: string;
  source?: string;
};
export type UiDecisionSuggestion = {
  action: "challenge" | "add";
  ref: number;
  topic: string;
  question: string;
  recommend: string;
  options: UiOption[];
  why: string;
};

const readOptions = (v: Json | undefined): UiOption[] =>
  Array.isArray(v)
    ? v.flatMap((o) =>
        isObject(o) && str(o.option)
          ? [{ option: str(o.option), tradeoff: str(o.tradeoff) }]
          : [],
      )
    : [];

// review.stated holds decisions for current rows (older rows: steps/priorities, skipped).
export function readDecisions(value: Json | undefined): UiDecision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((d) => {
    if (!isObject(d) || !str(d.topic) || !str(d.choice)) return [];
    return [
      {
        topic: str(d.topic),
        question: str(d.question),
        choice: str(d.choice),
        thinksYouWant: str(d.thinks_you_want),
        why: str(d.why),
        alternatives: readOptions(d.alternatives),
        estTokens: num(d.est_tokens),
        estCostUsd: num(d.est_cost_usd),
        estTime: str(d.est_time) || undefined,
        source: SOURCE_LABEL[str(d.source)],
      },
    ];
  });
}

export function readDecisionSuggestions(
  critique: Json | null,
): UiDecisionSuggestion[] {
  if (!isObject(critique) || !Array.isArray(critique.suggestions)) return [];
  return critique.suggestions.flatMap((s) => {
    if (!isObject(s)) return [];
    const action = str(s.action);
    if ((action !== "challenge" && action !== "add") || !str(s.recommend))
      return [];
    return [
      {
        action,
        ref: typeof s.ref === "number" ? s.ref : 0,
        topic: str(s.topic),
        question: str(s.question),
        recommend: str(s.recommend),
        options: readOptions(s.options),
        why: str(s.why),
      },
    ];
  });
}

// contracts.decisions -> the final answers shown once a review is decided.
export function readAnswers(value: Json | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((d) =>
    isObject(d) && str(d.topic) && str(d.answer)
      ? [
          {
            topic: str(d.topic),
            answer: str(d.answer),
            changed: d.changed === true,
          },
        ]
      : [],
  );
}

// Glass Box's priority suggestions (add_priority → "also consider"; drop/raise/lower → hints).
export type UiPrioritySuggestion = {
  action:
    "add_priority" | "drop_priority" | "raise_priority" | "lower_priority";
  ref: number;
  name: string;
  why: string;
};

export function readPrioritySuggestions(
  critique: Json | null,
): UiPrioritySuggestion[] {
  if (!isObject(critique) || !Array.isArray(critique.suggestions)) return [];
  return critique.suggestions.flatMap((s) => {
    if (!isObject(s)) return [];
    const action = str(s.action);
    if (
      ![
        "add_priority",
        "drop_priority",
        "raise_priority",
        "lower_priority",
      ].includes(action)
    )
      return [];
    const name = str(s.topic) || str(s.recommend);
    if (!name) return [];
    return [
      {
        action: action as UiPrioritySuggestion["action"],
        ref: typeof s.ref === "number" ? s.ref : 0,
        name,
        why: str(s.why),
      },
    ];
  });
}

// ---- Challenges (the interview) ----
export type UiChallenge = {
  id: string;
  scenario: string;
  tests: string[];
  whyItMatters: string;
  response?: string;
  favors?: string;
  wouldAsk?: boolean;
};

const challengesOf = (critique: Json | null) =>
  isObject(critique) && Array.isArray(critique.challenges)
    ? critique.challenges
    : [];

// Every review is ready for the human as soon as it exists: agents no longer answer
// challenges first (older reviews still waiting on answers show right away too).
export function isReady(review: Pick<AlignReview, "critique" | "answered_at">) {
  void review;
  return true;
}

export function readChallenges(review: AlignReview): UiChallenge[] {
  const answers = Array.isArray(review.challenge_answers)
    ? review.challenge_answers
    : [];
  return challengesOf(review.critique).flatMap((c) => {
    if (!isObject(c) || !str(c.scenario)) return [];
    const id = str(c.id);
    const a = answers.find((x) => isObject(x) && str(x.id) === id);
    return [
      {
        id,
        scenario: str(c.scenario),
        tests: readStrings(c.tests),
        whyItMatters: str(c.why_it_matters),
        ...(isObject(a)
          ? {
              response: str(a.response),
              favors: str(a.favors),
              wouldAsk: a.would_ask_human === true,
            }
          : {}),
      },
    ];
  });
}
