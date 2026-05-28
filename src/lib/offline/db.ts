/**
 * IndexedDB-backed offline store for the technician mobile PWA.
 *
 * Two tables:
 *   - pendingActions: outbound mutations queued while offline, drained by
 *     `flush()` once connectivity returns.
 *   - cachedVisits: full visit-detail snapshots for offline read.
 *
 * Dexie is only instantiated in the browser; in SSR / Node test contexts
 * we expose a stub that satisfies the type but never resolves real reads
 * (call sites guard with `typeof window !== "undefined"` or `isBrowser()`).
 */

import Dexie, { type Table } from "dexie";

export type OfflineActionKind =
  | "VISIT_COMPLETE"
  | "VISIT_NOTES"
  | "PHOTO_UPLOAD";

export interface PendingAction {
  /** Auto-increment primary key. */
  id?: number;
  kind: OfflineActionKind;
  /** Serialized payload (must be JSON-cloneable). */
  payload: unknown;
  /** Associated visit id, used by UI to group queued actions per visit. */
  visitId: string | null;
  /** ISO timestamp when first queued. */
  queuedAt: string;
  /** Retry counter; incremented every failed flush attempt. */
  attempts: number;
  /** Last error message, if any. */
  lastError: string | null;
}

export interface CachedVisit {
  /** Visit id (primary key). */
  id: string;
  /** Snapshot JSON (whatever the GET endpoint returned). */
  data: unknown;
  /** ISO timestamp when cached. */
  cachedAt: string;
}

export class OfflineDb extends Dexie {
  pendingActions!: Table<PendingAction, number>;
  cachedVisits!: Table<CachedVisit, string>;

  constructor() {
    super("seoul_aqua_offline_v1");
    this.version(1).stores({
      pendingActions: "++id, kind, visitId, queuedAt",
      cachedVisits: "id, cachedAt",
    });
  }
}

let _db: OfflineDb | null = null;

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

/** Lazy singleton. Throws in SSR — callers must check `isBrowser()`. */
export function getOfflineDb(): OfflineDb {
  if (!isBrowser()) {
    throw new Error("OfflineDb is browser-only");
  }
  if (!_db) {
    _db = new OfflineDb();
  }
  return _db;
}

/** Test hook — inject a Dexie instance backed by fake-indexeddb. */
export function __setOfflineDbForTest(db: OfflineDb | null): void {
  _db = db;
}
