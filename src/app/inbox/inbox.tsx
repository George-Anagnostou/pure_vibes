"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  isReady,
  STATUS_LABEL,
  type AlignReview,
} from "@/components/align-data";
import { AlignPanel } from "@/components/align-panel";
import { ConnectAgent } from "@/components/connect-agent";
import { createClient } from "@/lib/supabase/client";
import { useNotificationPermission } from "./use-notification-permission";

type Live = "connecting" | "live" | "offline";

const TITLE = "Inbox · Glass Box";

function upsert(list: AlignReview[], row: AlignReview) {
  const existing = list.find((r) => r.id === row.id);
  const merged = existing ? { ...existing, ...row } : row;
  return [merged, ...list.filter((r) => r.id !== row.id)]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
}

// Always-open page: new agent requests pop up as a sheet (plus a browser
// notification when the tab is in the background).
export function Inbox(props: {
  userId: string;
  initialReviews: AlignReview[];
}) {
  const [reviews, setReviews] = useState(props.initialReviews);
  const [activeId, setActiveId] = useState<string | null>(
    () =>
      props.initialReviews.find((r) => r.status === "pending" && isReady(r))
        ?.id ?? null,
  );
  const [live, setLive] = useState<Live>("connecting");
  const [permission, requestPermission] = useNotificationPermission();
  const permissionRef = useRef(permission);
  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function onNewRequest(row: AlignReview) {
      setActiveId(row.id);
      document.title = `New request · ${TITLE}`;
      if (document.hidden && permissionRef.current === "granted") {
        try {
          const n = new Notification(`${row.agent_name} needs your call`, {
            body: row.task,
            tag: row.id,
          });
          n.onclick = () => {
            window.focus();
            setActiveId(row.id);
            n.close();
          };
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
    }

    // Realtime applies RLS with the socket's JWT: set the user's token before
    // joining, or the channel silently receives nothing.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session)
        await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`glassbox-inbox-${props.userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reviews",
            filter: `user_id=eq.${props.userId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new as AlignReview;
            setReviews((prev) => upsert(prev, row));
            // Pop up once the agent has answered Glass Box's challenges (or had none).
            const old = payload.old as Partial<AlignReview> | undefined;
            const becameReady =
              row.status === "pending" &&
              isReady(row) &&
              (payload.eventType === "INSERT" || !old?.answered_at);
            if (becameReady) onNewRequest(row);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setLive("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            setLive("offline");
        });
    });
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [props.userId]);

  useEffect(() => {
    const reset = () => {
      if (!document.hidden) document.title = TITLE;
    };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);

  const active = reviews.find((r) => r.id === activeId) ?? null;
  const pending = reviews.filter((r) => r.status === "pending").length;

  return (
    <main className="mx-auto max-w-lg px-4 pt-6 pb-16">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight">Inbox</h1>
        <LiveDot live={live} />
      </div>
      <p className="mt-1 text-ink-soft">
        Keep this open. When an agent asks about its priorities, it pops up
        here.
      </p>

      {permission === "default" && (
        <button
          type="button"
          onClick={requestPermission}
          className="mt-4 w-full rounded-xl border-2 border-ink px-4 py-3 text-left font-bold hover:bg-card"
        >
          Turn on notifications
          <span className="block text-sm font-normal text-ink-soft">
            So you hear about requests when this tab is in the background.
          </span>
        </button>
      )}
      {permission === "denied" && (
        <p className="mt-4 text-sm text-ink-soft">
          Notifications are blocked for this site. Requests still pop up here.
        </p>
      )}

      <section className="mt-8" aria-labelledby="recent-h">
        <h2
          id="recent-h"
          className="text-sm font-bold tracking-wide text-ink-soft uppercase"
        >
          Recent requests{pending ? ` · ${pending} waiting` : ""}
        </h2>
        {reviews.length === 0 ? (
          <p className="mt-3 rounded-xl border-2 border-dashed border-line p-6 text-center text-ink-soft">
            Nothing yet. Connect an agent below, then ask it to do something.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
            {reviews.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.task}</p>
                  <p className="text-sm text-ink-soft">
                    {r.agent_name} ·{" "}
                    {new Date(r.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {r.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => setActiveId(r.id)}
                    className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white"
                  >
                    Review
                  </button>
                ) : (
                  <Link
                    href={`/align/${r.id}`}
                    className="shrink-0 rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="mt-8 rounded-xl border border-line bg-card">
        <summary className="cursor-pointer p-4 font-semibold">
          Connect an agent
        </summary>
        <div className="px-4 pb-4">
          <ConnectAgent />
        </div>
      </details>

      {active && (
        <RequestSheet
          review={active}
          onClose={() => {
            setActiveId(null);
            document.title = TITLE;
          }}
        />
      )}
    </main>
  );
}

function RequestSheet({
  review,
  onClose,
}: {
  review: AlignReview;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`sheet-${review.id}`}
        className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <p
            id={`sheet-${review.id}`}
            className="min-w-0 flex-1 text-lg leading-snug [overflow-wrap:anywhere]"
          >
            <strong className="font-black">{review.agent_name}</strong> is about
            to: {review.task}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close for now"
            className="grid size-9 shrink-0 place-items-center rounded-full text-2xl text-ink-soft hover:bg-card hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="mt-5">
          <AlignPanel key={review.id} review={review} onDone={onClose} />
        </div>
      </div>
    </div>
  );
}

function LiveDot({ live }: { live: Live }) {
  const tone =
    live === "live"
      ? "bg-go"
      : live === "offline"
        ? "bg-stop"
        : "bg-warn-strong";
  const label =
    live === "live"
      ? "Listening"
      : live === "offline"
        ? "Offline — refresh"
        : "Connecting…";
  return (
    <span className="flex items-center gap-2 text-sm text-ink-soft">
      <span className={`size-2.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}
