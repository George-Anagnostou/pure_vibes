"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/glassbox/glassbox.module.css";

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
      <div className="flex flex-wrap items-center gap-3">
        {canSubscribe && (
          <button
            disabled={Boolean(busy)}
            onClick={() => open("checkout")}
            className={styles.btnDark}
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
            className={styles.btnSecondary}
            style={{ width: "auto", padding: "0 18px" }}
          >
            {busy === "portal" ? "Opening billing…" : "Manage billing"}
          </button>
        )}
        <button
          disabled={Boolean(busy)}
          onClick={() => router.refresh()}
          className={styles.mutedLink}
        >
          Refresh status
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.alertCard}>
          {error}
        </p>
      )}
    </div>
  );
}
