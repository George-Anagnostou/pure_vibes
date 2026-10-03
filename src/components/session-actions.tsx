"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NEXT_PATH_KEY } from "@/components/sign-in-form";

// After a magic-link sign-in lands on "/", continue to the page that asked.
export function ResumeAfterSignIn() {
  const router = useRouter();
  useEffect(() => {
    let next: string | null = null;
    try {
      next = localStorage.getItem(NEXT_PATH_KEY);
      localStorage.removeItem(NEXT_PATH_KEY);
    } catch {
      return;
    }
    if (next && next.startsWith("/") && !next.startsWith("//"))
      router.replace(next);
  }, [router]);
  return null;
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const res = await fetch("/api/auth/sign-out", { method: "POST" });
          setBusy(false);
          if (res.ok) router.refresh();
          else setError("Could not sign out. Try again.");
        }}
        className="text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink disabled:opacity-60"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <span role="alert" className="text-sm text-stop">
          {error}
        </span>
      )}
    </span>
  );
}
