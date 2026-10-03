"use client";

import { useState, type FormEvent } from "react";
import type {
  UiDecision,
  UiDecisionSuggestion,
  UiOption,
} from "@/components/align-data";

// One card per decision the agent is making on the human's behalf: its choice and
// what it thinks you want, the alternatives it weighed, Glass Box's challenge, and
// "Other…" to say what you actually want. Glass Box's "add" suggestions become
// extra cards for decisions the agent didn't realize it was making.

export type CardModel = {
  key: string;
  topic: string;
  question: string;
  agentChoice?: string; // absent for decisions Glass Box added
  thinksYouWant?: string;
  why?: string;
  source?: string;
  estimate?: string;
  options: (UiOption & { tag?: "agent" | "glassbox" })[];
  challenge?: { recommend: string; why: string };
  addedBy?: "glassbox";
};

export type Answer = { selected: string; custom: string };

const fmtTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`;

export function buildCards(
  decisions: UiDecision[],
  suggestions: UiDecisionSuggestion[],
): CardModel[] {
  const cards: CardModel[] = decisions.map((d, i) => {
    const challenge = suggestions.find(
      (s) => s.action === "challenge" && s.ref === i + 1,
    );
    const options: CardModel["options"] = [
      { option: d.choice, tradeoff: "", tag: "agent" },
      ...d.alternatives,
    ];
    if (challenge) {
      const at = options.findIndex((o) => same(o.option, challenge.recommend));
      if (at > 0) options[at] = { ...options[at], tag: "glassbox" };
      else if (at === -1)
        options.push({
          option: challenge.recommend,
          tradeoff: challenge.options[0]?.tradeoff ?? "",
          tag: "glassbox",
        });
    }
    const est = [
      d.estTime,
      d.estTokens !== undefined ? `~${fmtTokens(d.estTokens)} tokens` : "",
      d.estCostUsd !== undefined ? `$${d.estCostUsd}` : "",
    ].filter(Boolean);
    return {
      key: `d${i}`,
      topic: d.topic,
      question: d.question,
      agentChoice: d.choice,
      thinksYouWant: d.thinksYouWant,
      why: d.why,
      source: d.source,
      estimate: est.join(" · ") || undefined,
      options,
      challenge: challenge
        ? { recommend: challenge.recommend, why: challenge.why }
        : undefined,
    };
  });
  suggestions
    .filter((s) => s.action === "add")
    .forEach((s, i) => {
      const options: CardModel["options"] = s.options.length
        ? [...s.options]
        : [{ option: s.recommend, tradeoff: "" }];
      if (!options.some((o) => same(o.option, s.recommend)))
        options.unshift({ option: s.recommend, tradeoff: "" });
      cards.push({
        key: `g${i}`,
        topic: s.topic,
        question: s.question,
        options: options.map((o) =>
          same(o.option, s.recommend) ? { ...o, tag: "glassbox" } : o,
        ),
        challenge: { recommend: s.recommend, why: s.why },
        addedBy: "glassbox",
      });
    });
  return cards;
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// The answer for a card, or "" when a Glass Box card was left untouched.
export function answerFor(card: CardModel, a: Answer | undefined) {
  if (!a) return card.agentChoice ?? "";
  if (a.selected === "__other") return a.custom.trim();
  return a.selected;
}

export function DecisionCards({
  cards,
  answers,
  onAnswer,
}: {
  cards: CardModel[];
  answers: Record<string, Answer>;
  onAnswer: (key: string, answer: Answer) => void;
}) {
  return (
    <ol className="space-y-2.5">
      {cards.map((card) => (
        <DecisionCard
          key={card.key}
          card={card}
          answer={answers[card.key]}
          onAnswer={(a) => onAnswer(card.key, a)}
        />
      ))}
    </ol>
  );
}

function DecisionCard({
  card,
  answer,
  onAnswer,
}: {
  card: CardModel;
  answer?: Answer;
  onAnswer: (a: Answer) => void;
}) {
  const selected = answer?.selected ?? card.agentChoice ?? "";
  const changed = card.agentChoice
    ? !!answer && !same(answerFor(card, answer), card.agentChoice)
    : !!answer && !!answerFor(card, answer);
  const name = `opt-${card.key}`;
  return (
    <li
      className={`rounded-xl border bg-card p-3 shadow-sm ${
        changed ? "border-ink" : "border-line"
      }`}
      data-testid="decision"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-paper px-1.5 py-px text-[10px] font-bold tracking-wide text-ink-soft uppercase">
          {card.topic}
        </span>
        {card.source && (
          <span
            className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase ${
              card.source === "Assumption" || card.source === "Its judgment"
                ? "bg-warn-bg text-warn"
                : "bg-paper text-ink-soft"
            }`}
          >
            {card.source}
          </span>
        )}
        {card.addedBy && (
          <span className="rounded bg-go-bg px-1.5 py-px text-[10px] font-semibold text-go uppercase">
            It didn&apos;t ask about this
          </span>
        )}
        {changed && (
          <span className="ml-auto rounded bg-ink px-1.5 py-px text-[10px] font-semibold text-white uppercase">
            Changed
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[15px] leading-snug font-bold">
        {card.question || card.topic}
      </p>
      {card.agentChoice && (
        <p className="mt-1 text-[13px] leading-snug text-ink-soft">
          It plans to{" "}
          <span className="font-semibold text-ink">{card.agentChoice}</span>
          {card.thinksYouWant && (
            <>
              , because it thinks you want{" "}
              <span className="italic">
                {card.thinksYouWant.replace(/\.$/, "")}
              </span>
            </>
          )}
          .
          {card.estimate && (
            <span className="ml-1 inline-block rounded bg-brand/10 px-1 text-[11px] font-semibold text-brand not-italic">
              {card.estimate}
            </span>
          )}
        </p>
      )}
      {card.why && (
        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-soft/90">
          Its reasoning: {card.why}
        </p>
      )}
      {card.challenge && (
        <p className="mt-2 rounded-lg bg-warn-bg px-2 py-1.5 text-[12px] leading-snug text-warn">
          <span className="font-bold">Glass Box:</span> {card.challenge.why}
        </p>
      )}
      <fieldset className="mt-2 space-y-1">
        <legend className="sr-only">{card.question}</legend>
        {card.options.map((o) => (
          <label
            key={o.option}
            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 text-[13px] ${
              same(selected, o.option)
                ? "border-ink bg-paper"
                : "border-line hover:border-ink-soft"
            }`}
          >
            <input
              type="radio"
              name={name}
              className="mt-0.5"
              checked={same(selected, o.option)}
              onChange={() => onAnswer({ selected: o.option, custom: "" })}
            />
            <span className="min-w-0">
              <span className="font-semibold">{o.option}</span>
              {o.tag === "agent" && (
                <span className="ml-1 text-[11px] text-ink-soft">
                  (its choice)
                </span>
              )}
              {o.tag === "glassbox" && (
                <span className="ml-1 text-[11px] font-semibold text-go">
                  (Glass Box suggests)
                </span>
              )}
              {o.tradeoff && (
                <span className="block text-[11.5px] leading-snug text-ink-soft">
                  {o.tradeoff}
                </span>
              )}
            </span>
          </label>
        ))}
        <label
          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[13px] ${
            selected === "__other"
              ? "border-ink bg-paper"
              : "border-dashed border-line"
          }`}
        >
          <input
            type="radio"
            name={name}
            checked={selected === "__other"}
            onChange={() =>
              onAnswer({ selected: "__other", custom: answer?.custom ?? "" })
            }
          />
          <input
            value={answer?.selected === "__other" ? answer.custom : ""}
            onFocus={() =>
              onAnswer({ selected: "__other", custom: answer?.custom ?? "" })
            }
            onChange={(e) =>
              onAnswer({ selected: "__other", custom: e.target.value })
            }
            maxLength={300}
            placeholder="Something else… tell it what you want"
            className="min-w-0 flex-1 bg-transparent placeholder:text-ink-soft focus:outline-none"
          />
        </label>
      </fieldset>
    </li>
  );
}

// Free-text instructions the human wants to add on top of the decisions.
export function ExtraInstructions({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [text, setText] = useState("");
  function add(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (t && !items.includes(t)) onChange([...items, t]);
    setText("");
  }
  return (
    <div className="rounded-xl border border-dashed border-line bg-card/60 p-3">
      <p className="text-[13px] font-bold">Anything else it should know?</p>
      {items.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {items.map((t) => (
            <li
              key={t}
              className="flex items-start gap-2 rounded-lg bg-paper px-2 py-1 text-[13px]"
            >
              <span className="flex-1">{t}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== t))}
                aria-label={`Delete "${t}"`}
                className="text-ink-soft hover:text-stop"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-1.5 flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="e.g. Build a proof of concept first and show me"
          aria-label="Add an instruction"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1.5 text-[13px] focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-lg bg-ink px-3 text-[13px] font-bold text-white disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  );
}
