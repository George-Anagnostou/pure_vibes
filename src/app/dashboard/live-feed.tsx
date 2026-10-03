"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Critique, Revealed } from "@/lib/glassbox/types";
import { createClient } from "@/lib/supabase/client";
import type { EventRow, Json } from "@/types/database";

type ReviewLite = { id: string; agent_name: string; task: string; status: string; critique: Json | null; revealed: Json | null; created_at: string };

export function LiveFeed(props: { userId: string; initialReviews: ReviewLite[]; initialEvents: EventRow[] }) {
  const [reviews, setReviews] = useState(props.initialReviews);
  const [events, setEvents] = useState(props.initialEvents);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("glassbox-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `user_id=eq.${props.userId}` }, (payload) => {
        const row = payload.new as ReviewLite;
        setReviews((prev) => [row, ...prev.filter((r) => r.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: `user_id=eq.${props.userId}` }, (payload) => {
        setEvents((prev) => [payload.new as EventRow, ...prev]);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [props.userId]);

  async function mintKey() {
    const res = await fetch("/api/agent-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Claude Code" }) });
    const body = await res.json();
    setKey(res.ok ? body.key : `Error: ${body.error}`);
  }

  const breach = events.find((e) => e.type === "breach");

  return (
    <>
      {breach && (
        <div className="rounded bg-red-600 p-4 text-white">
          <b>BLOCKED:</b> {(breach.detail as { reason?: string })?.reason ?? breach.action}
        </div>
      )}
      <section>
        <h2 className="text-lg font-semibold">Reviews</h2>
        <ul className="divide-y">
          {reviews.map((r) => {
            const c = r.critique as unknown as Critique | null;
            const v = r.revealed as unknown as Revealed | null;
            return (
              <li key={r.id} className="py-2">
                <Link className="underline" href={`/approve/${r.id}`}>{r.agent_name}: {r.task}</Link>
                <div className="text-sm">
                  <span className={c?.verdict === "red" ? "text-red-600" : c?.verdict === "yellow" ? "text-yellow-600" : "text-green-600"}>{c?.verdict ?? "…"}</span>
                  {" · "}{r.status}{" · "}{v?.headline}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Live events</h2>
        <ul className="text-sm">
          {events.map((e) => (
            <li key={e.id} className={e.type === "breach" ? "font-bold text-red-600" : e.type === "drift" ? "text-yellow-600" : ""}>
              {new Date(e.created_at).toLocaleTimeString()} · {e.type} · {e.action}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <button className="rounded border px-3 py-1" onClick={mintKey}>Create agent key</button>
        {key && <pre className="mt-2 break-all whitespace-pre-wrap rounded bg-gray-100 p-2 text-xs text-black">{key}</pre>}
      </section>
    </>
  );
}
