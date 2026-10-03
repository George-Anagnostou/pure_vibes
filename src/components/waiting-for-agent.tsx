"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Shown while the agent is still answering Glass Box's challenges; refreshes until ready.
export function WaitingForAgent({ agentName }: { agentName: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <p className="gb-pulse rounded-xl border border-dashed border-line bg-card p-4 text-[14px] text-ink-soft">
      Glass Box is interviewing {agentName} with real-world challenges. Its
      answers will appear here in a moment…
    </p>
  );
}
