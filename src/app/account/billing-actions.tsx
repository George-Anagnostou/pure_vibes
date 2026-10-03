"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BillingActions({
  canSubscribe,
  canManage,
}: {
  canSubscribe: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function open(action: "checkout" | "portal") {
    setBusy(action);
    setError("");
    try {
      const res = await fetch(`/api/billing/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error ?? "Billing is unavailable. Try again shortly.",
        );
      const url = new URL(body.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw new Error("Could not open secure billing. Try again.");
      window.location.assign(url.href);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not connect to billing. Try again.",
      );
      setBusy("");
    }
  }
  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap gap-3">
        {canSubscribe && (
          <button
            disabled={Boolean(busy)}
            onClick={() => open("checkout")}
            className="min-h-12 rounded-xl bg-ink px-5 font-bold text-white disabled:opacity-60"
          >
            {busy === "checkout"
              ? "Opening checkout…"
              : "Subscribe with Stripe"}
          </button>
        )}
        {canManage && (
          <button
            disabled={Boolean(busy)}
            onClick={() => open("portal")}
            className="min-h-12 rounded-xl border-2 border-ink px-5 font-bold disabled:opacity-60"
          >
            {busy === "portal" ? "Opening billing…" : "Manage billing"}
          </button>
        )}
        <button
          disabled={Boolean(busy)}
          onClick={() => router.refresh()}
          className="min-h-12 px-2 text-sm underline disabled:opacity-60"
        >
          Refresh status
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-stop">
          {error}
        </p>
      )}
    </div>
  );
}
