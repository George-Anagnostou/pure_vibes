"use client";

import { useCallback, useSyncExternalStore } from "react";

type Permission = NotificationPermission | "unsupported";

const listeners = new Set<() => void>();
const supported = () =>
  typeof window !== "undefined" && "Notification" in window;

function snapshot(): Permission {
  return supported() ? Notification.permission : "unsupported";
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useNotificationPermission() {
  const permission = useSyncExternalStore(
    subscribe,
    snapshot,
    (): Permission => "unsupported",
  );
  const request = useCallback(async () => {
    if (!supported()) return;
    try {
      await Notification.requestPermission();
    } finally {
      listeners.forEach((l) => l());
    }
  }, []);
  return [permission, request] as const;
}
