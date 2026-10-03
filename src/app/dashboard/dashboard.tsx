"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  isReady,
  STATUS_LABEL,
  type AlignReview,
} from "@/components/align-data";
import { AlignPanel } from "@/components/align-panel";
import { ConnectAgent } from "@/components/connect-agent";
import styles from "@/components/glassbox/glassbox.module.css";
import { glassboxFonts } from "@/components/glassbox/fonts";
import { createClient } from "@/lib/supabase/client";
import { useNotificationPermission } from "./use-notification-permission";

type Live = "connecting" | "live" | "offline";

const TITLE = "Dashboard · Glass Box";

const TOOLS = [
  { label: "Apple Intelligence", src: "/tools/apple-intelligence-02.svg" },
  { label: "Perplexity", src: "/tools/perplexity.svg" },
  { label: "Siri", src: "/tools/apple-intelligence-04.svg" },
  { label: "Grok", src: "/tools/grok.svg" },
  { label: "Claude", src: "/tools/claude.svg" },
  { label: "ChatGPT", src: "/tools/chatgpt.svg" },
];

const PILL_CLASS: Record<string, string> = {
  pending: styles.pillPending,
  approved: styles.pillApproved,
  rejected: styles.pillRejected,
  expired: styles.pillExpired,
};

function upsert(list: AlignReview[], row: AlignReview) {
  const existing = list.find((r) => r.id === row.id);
  const merged = existing ? { ...existing, ...row } : row;
  return [merged, ...list.filter((r) => r.id !== row.id)]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
}

// Signed-in home: start a project by connecting a tool, prior projects on
// the right. Keeps the always-open inbox behaviour — new agent requests
// pop up as a sheet (plus a browser notification in the background).
export function Dashboard(props: {
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
  const waiting = reviews.filter((r) => r.status === "pending").length;

  return (
    <main className={styles.alignShell}>
      <div className={styles.homeGrid}>
        <div className={styles.homeHead}>
          <h1 className={styles.homeHeader}>
            Let&apos;s get started with a new project
          </h1>
          <LiveLine live={live} waiting={waiting} />
        </div>

        <div className={styles.homeMain} style={{ marginTop: 16 }}>
          <div className={styles.connectCard}>
            <p className={styles.connectLabel}>Connect your agents</p>
            <div className={styles.toolRow} aria-hidden>
              {TOOLS.map((t) => (
                <Image
                  key={t.src}
                  src={t.src}
                  alt=""
                  title={t.label}
                  width={40}
                  height={40}
                />
              ))}
            </div>
            <ConnectAgent />
            {permission === "default" && (
              <p style={{ margin: "14px 0 0" }}>
                <button
                  type="button"
                  onClick={requestPermission}
                  className={styles.mutedLink}
                >
                  Turn on notifications
                </button>{" "}
                <span className={styles.smallBody}>
                  — so you hear about requests when this tab is in the
                  background.
                </span>
              </p>
            )}
            {permission === "denied" && (
              <p className={styles.smallBody} style={{ margin: "14px 0 0" }}>
                Notifications are blocked for this site. Requests still pop up
                here.
              </p>
            )}
          </div>
        </div>

        <div className={styles.homeSide} style={{ marginTop: 16 }}>
          <p className={styles.projectsTitle}>
            Prior Projects{waiting ? ` · ${waiting} waiting` : ""}
          </p>
          {reviews.length === 0 ? (
            <div className={styles.optCard}>
              <p className={styles.smallBody} style={{ margin: 0 }}>
                Nothing yet. Connect an agent, then ask it to do something — its
                request shows up here.
              </p>
            </div>
          ) : (
            <div className={styles.projectList}>
              {reviews.map((r) =>
                r.status === "pending" ? (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveId(r.id)}
                    className={`${styles.projectTile} ${styles.projectTileButton}`}
                  >
                    <ProjectBody review={r} />
                    <span className={`${styles.pill} ${styles.pillPending}`}>
                      {STATUS_LABEL.pending}
                    </span>
                  </button>
                ) : (
                  <Link
                    key={r.id}
                    href={`/align/${r.id}`}
                    className={styles.reviewLink}
                  >
                    <span className={styles.projectTile}>
                      <ProjectBody review={r} />
                      <span
                        className={`${styles.pill} ${
                          PILL_CLASS[r.status] ?? styles.pillExpired
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </span>
                  </Link>
                ),
              )}
            </div>
          )}
        </div>
      </div>

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

function ProjectBody({ review }: { review: AlignReview }) {
  return (
    <span className={styles.projectBody}>
      <span className={styles.projectDate} suppressHydrationWarning>
        {new Date(review.created_at).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
        })}{" "}
        · {review.agent_name}
      </span>
      <span
        className={styles.projectName}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {review.task}
      </span>
    </span>
  );
}

function LiveLine({ live, waiting }: { live: Live; waiting: number }) {
  const dot =
    live === "live"
      ? styles.feedDot
      : live === "offline"
        ? `${styles.feedDot} ${styles.feedDotBreach}`
        : `${styles.feedDot} ${styles.feedDotDrift}`;
  const label =
    live === "live"
      ? waiting
        ? `Listening — ${waiting} request${waiting === 1 ? "" : "s"} waiting`
        : "Listening for your agents"
      : live === "offline"
        ? "Offline — refresh"
        : "Connecting…";
  return (
    <p className={styles.liveRow} style={{ marginTop: -16 }}>
      <span className={dot} />
      {label}
    </p>
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
        className={`${glassboxFonts} max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl`}
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
          <AlignPanel
            key={review.id}
            review={review}
            onDone={onClose}
            compact
          />
        </div>
      </div>
    </div>
  );
}
