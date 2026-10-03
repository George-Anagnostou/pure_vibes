"use client";

import type { UiChallenge } from "@/components/align-data";

// Real-world situations Glass Box put to the agent, each pitting two of its priorities
// against each other, with what the agent said it would do. The human confirms or
// says what to do instead. A "mismatch" is the agent favoring a priority it ranked lower.

export type Ruling = { approved: boolean; instead: string };

const norm = (s: string) => s.trim().toLowerCase();

export function mismatch(c: UiChallenge, ranked: string[]) {
  if (!c.favors || c.tests.length < 2) return null;
  const winner = c.tests.find((t) => norm(t) === norm(c.favors!));
  const loser = c.tests.find((t) => norm(t) !== norm(c.favors!));
  if (!winner || !loser) return null;
  const w = ranked.findIndex((r) => norm(r) === norm(winner));
  const l = ranked.findIndex((r) => norm(r) === norm(loser));
  return w !== -1 && l !== -1 && w > l
    ? { winner, loser, winnerRank: w + 1, loserRank: l + 1 }
    : null;
}

export function ChallengeCards({
  challenges,
  ranked,
  rulings,
  onRule,
}: {
  challenges: UiChallenge[];
  ranked: string[]; // the agent's stated order, for spotting mismatches
  rulings: Record<string, Ruling>;
  onRule: (id: string, r: Ruling) => void;
}) {
  return (
    <ol className="space-y-2.5">
      {challenges.map((c) => {
        const r = rulings[c.id] ?? { approved: true, instead: "" };
        const m = mismatch(c, ranked);
        return (
          <li
            key={c.id}
            className={`rounded-xl border bg-card p-3 shadow-sm ${r.approved ? "border-line" : "border-ink"}`}
            data-testid="challenge"
          >
            {c.tests.length === 2 && (
              <p className="text-[10px] font-bold tracking-wide text-ink-soft uppercase">
                {c.tests[0]} <span className="font-normal">vs</span>{" "}
                {c.tests[1]}
              </p>
            )}
            <p className="mt-1 text-[14px] leading-snug font-semibold">
              {c.scenario}
            </p>
            {c.response ? (
              <div className="mt-2 rounded-lg bg-paper px-2.5 py-2 text-[13px] leading-snug">
                <span className="text-[10px] font-bold tracking-wide text-ink-soft uppercase">
                  It would
                </span>
                <span className="block">{c.response}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.favors && (
                    <span className="rounded bg-card px-1.5 py-px text-[10.5px] font-semibold">
                      Favors: {c.favors}
                    </span>
                  )}
                  {c.wouldAsk && (
                    <span className="rounded bg-go-bg px-1.5 py-px text-[10.5px] font-semibold text-go">
                      Would ask you first
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-ink-soft italic">
                The agent didn&apos;t answer this one.
              </p>
            )}
            {m && (
              <p className="mt-1.5 rounded-lg bg-warn-bg px-2 py-1 text-[12px] leading-snug text-warn">
                <span className="font-bold">Says one thing, does another:</span>{" "}
                it ranked {m.winner} #{m.winnerRank} and {m.loser} #
                {m.loserRank}, but chose {m.winner} here.
              </p>
            )}
            {c.whyItMatters && (
              <p className="mt-1 text-[11.5px] text-ink-soft">
                {c.whyItMatters}
              </p>
            )}
            <div className="mt-2 space-y-1 text-[13px]">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`ch-${c.id}`}
                  checked={r.approved}
                  onChange={() => onRule(c.id, { approved: true, instead: "" })}
                />
                <span className="font-semibold">That&apos;s right</span>
              </label>
              <label
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${r.approved ? "border-dashed border-line" : "border-ink bg-paper"}`}
              >
                <input
                  type="radio"
                  name={`ch-${c.id}`}
                  checked={!r.approved}
                  onChange={() =>
                    onRule(c.id, { approved: false, instead: r.instead })
                  }
                />
                <input
                  value={r.instead}
                  onFocus={() =>
                    onRule(c.id, { approved: false, instead: r.instead })
                  }
                  onChange={(e) =>
                    onRule(c.id, { approved: false, instead: e.target.value })
                  }
                  maxLength={600}
                  placeholder="No, do this instead…"
                  className="min-w-0 flex-1 bg-transparent placeholder:text-ink-soft focus:outline-none"
                />
              </label>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
