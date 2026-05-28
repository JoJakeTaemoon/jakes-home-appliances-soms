"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import {
  useFlushOnReconnect,
  listPending,
} from "@/lib/offline/queue";
import { buildSender } from "@/lib/offline/senders";
import type { PendingAction } from "@/lib/offline/db";

/**
 * Sticky status pill rendered above the mobile shell content.
 *
 * - When offline: red "Offline" pill + count of queued actions.
 * - When online with queued items: yellow "Syncing N…" pill.
 * - When fully synced: invisible (returns null).
 *
 * Also drives background flush via `useFlushOnReconnect`.
 */
export function OfflineIndicator() {
  const t = useTranslations("mobile.offline");
  const { accessToken } = useAuth();
  const sender = buildSender(() => accessToken);
  const { online, flushNow } = useFlushOnReconnect(sender);
  const [queued, setQueued] = useState<PendingAction[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await listPending();
        if (!cancelled) setQueued(rows);
      } catch {
        /* ignore */
      }
    };
    refresh();
    const tick = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, [online]);

  // After flush attempts, refresh count
  useEffect(() => {
    if (!online || queued.length === 0) return;
    let cancelled = false;
    (async () => {
      const res = await flushNow();
      if (!cancelled && res.succeeded > 0) {
        const rows = await listPending();
        if (!cancelled) setQueued(rows);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, queued.length, flushNow]);

  if (online && queued.length === 0) return null;

  const offlineLabel = t("offline");
  const queuedLabel = t("queued", { count: queued.length });

  if (!online) {
    return (
      <div className="sticky top-14 z-10 -mx-4 mb-2 flex items-center justify-between bg-red-50 px-4 py-1.5 text-xs font-medium text-red-700">
        <span>{offlineLabel}</span>
        {queued.length > 0 && <span>{queuedLabel}</span>}
      </div>
    );
  }

  // online + queued > 0 → syncing
  return (
    <div className="sticky top-14 z-10 -mx-4 mb-2 flex items-center justify-between bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-700">
      <span>{t("syncing")}</span>
      <span>{queuedLabel}</span>
    </div>
  );
}
