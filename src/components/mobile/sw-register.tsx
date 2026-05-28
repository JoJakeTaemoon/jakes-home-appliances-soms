"use client";

import { useEffect } from "react";

/**
 * Mount-only component that registers /sw.js once per session.
 * Mounted from <MobileShell> so the SW is only active on /mobile/* pages.
 *
 * No-op in unsupported browsers and in dev (Next.js HMR doesn't play well
 * with service workers; opt out unless NODE_ENV=production).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // Don't surface — SW is opportunistic, app must still work without it
        console.warn("[SW] register failed:", err);
      });
  }, []);
  return null;
}
