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

export type StatedPriority = { name: string; why: string; source?: string };
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
