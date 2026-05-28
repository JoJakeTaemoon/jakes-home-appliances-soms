/**
 * Offline action queue for the technician PWA.
 *
 * Public surface:
 *   - enqueue(action)     — persist a queued mutation
 *   - flush(opts)         — drain pending actions; retry-with-backoff
 *   - clearAll()          — wipe (test helper)
 *   - listPending()       — read snapshot for UI badges
 *   - useOnlineStatus()   — React hook returning navigator.onLine
 *   - useFlushOnReconnect() — register listeners that auto-flush
 *
 * Each action has a `kind` discriminator; flush() maps each kind to its
 * concrete network call via the `sender` argument (so we can stub it in
 * tests without mocking `fetch`).
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getOfflineDb,
  isBrowser,
  type PendingAction,
  type OfflineActionKind,
} from "@/lib/offline/db";

export interface EnqueueInput {
  kind: OfflineActionKind;
  payload: unknown;
  visitId?: string | null;
}

const MAX_ATTEMPTS = 5;

/**
 * Add an action to the pending queue. Returns the assigned id.
 * No-ops (returns -1) in non-browser contexts so SSR call paths don't crash.
 */
export async function enqueue(input: EnqueueInput): Promise<number> {
  if (!isBrowser()) return -1;
  const db = getOfflineDb();
  const id = await db.pendingActions.add({
    kind: input.kind,
    payload: input.payload,
    visitId: input.visitId ?? null,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  });
  return Number(id);
}

/** Read all pending rows (UI: "Queued (N)" badge). */
export async function listPending(): Promise<PendingAction[]> {
  if (!isBrowser()) return [];
  const db = getOfflineDb();
  return db.pendingActions.orderBy("queuedAt").toArray();
}

/** Remove a single pending row (e.g. cancel after permanent failure). */
export async function removePending(id: number): Promise<void> {
  if (!isBrowser()) return;
  const db = getOfflineDb();
  await db.pendingActions.delete(id);
}

export async function clearAll(): Promise<void> {
  if (!isBrowser()) return;
  const db = getOfflineDb();
  await db.pendingActions.clear();
  await db.cachedVisits.clear();
}

/** Pluggable per-kind sender — caller supplies the network call. */
export type ActionSender = (action: PendingAction) => Promise<void>;

export interface FlushResult {
  attempted: number;
  succeeded: number;
  failed: number;
  remaining: number;
}

/**
 * Drain the queue. Sender is called per action; on success the row is
 * deleted, on failure the row's attempts is incremented and the loop
 * moves on. Rows that exceed MAX_ATTEMPTS are kept (caller can choose
 * to drop them via UI), but flush() stops re-attempting them.
 */
export async function flush(sender: ActionSender): Promise<FlushResult> {
  if (!isBrowser()) {
    return { attempted: 0, succeeded: 0, failed: 0, remaining: 0 };
  }
  const db = getOfflineDb();
  const all = await db.pendingActions.orderBy("queuedAt").toArray();
  const eligible = all.filter((a) => a.attempts < MAX_ATTEMPTS);
  let succeeded = 0;
  let failed = 0;
  for (const action of eligible) {
    try {
      await sender(action);
      if (action.id !== undefined) await db.pendingActions.delete(action.id);
      succeeded += 1;
    } catch (err) {
      failed += 1;
      if (action.id !== undefined) {
        await db.pendingActions.update(action.id, {
          attempts: action.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  const remaining = await db.pendingActions.count();
  return { attempted: eligible.length, succeeded, failed, remaining };
}

/* ───────────────────────────── hooks ───────────────────────────── */

/** React hook returning `navigator.onLine` reactively. SSR-safe (defaults true). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/**
 * Auto-flush hook. Registers an `online` event listener + 30s interval
 * polling. The provided sender is invoked for each queued action.
 */
export function useFlushOnReconnect(
  sender: ActionSender,
  opts: { intervalMs?: number } = {},
): { online: boolean; flushNow: () => Promise<FlushResult> } {
  const online = useOnlineStatus();
  const intervalMs = opts.intervalMs ?? 30_000;
  const flushNow = useCallback(() => flush(sender), [sender]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const run = async () => {
      if (cancelled || !navigator.onLine) return;
      try {
        await flushNow();
      } catch {
        /* swallow — retries handled per-action */
      }
    };
    // initial attempt + interval
    run();
    const tick = window.setInterval(run, intervalMs);
    const onOnline = () => {
      run();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.removeEventListener("online", onOnline);
    };
  }, [flushNow, intervalMs]);

  return { online, flushNow };
}
