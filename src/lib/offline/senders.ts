/**
 * Concrete action senders — bridge between queued PendingAction rows
 * and the mobile API endpoints. Used by `flush()` in queue.ts.
 *
 * Each sender accepts the PendingAction row and is responsible for
 * making the network call. Throws on failure so flush() can retry.
 */

import type { PendingAction } from "@/lib/offline/db";

export interface VisitCompletePayload {
  visitId: string;
  findings: string;
  partsReplaced: string[];
  photos: { storageKey: string; takenAt: string }[];
  customerSignaturePhotoStorageKey: string;
  collectedAmount: number | null;
  paymentMethod?: string;
}

export interface VisitNotesPayload {
  visitId: string;
  findings?: string;
  partsReplaced?: string[];
}

/**
 * Build a sender bound to the current auth token. Returns a function that
 * dispatches per-kind via the matching mobile API endpoint.
 */
export function buildSender(getAccessToken: () => string | null) {
  return async function sendAction(action: PendingAction): Promise<void> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    switch (action.kind) {
      case "VISIT_COMPLETE": {
        const p = action.payload as VisitCompletePayload;
        const res = await fetch(`/api/mobile/visits/${p.visitId}/complete`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({
            findings: p.findings,
            partsReplaced: p.partsReplaced,
            photos: p.photos,
            customerSignaturePhotoStorageKey: p.customerSignaturePhotoStorageKey,
            collectedAmount: p.collectedAmount,
            paymentMethod: p.paymentMethod,
          }),
        });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            msg = j?.error?.message ?? msg;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        return;
      }
      case "VISIT_NOTES": {
        const p = action.payload as VisitNotesPayload;
        const res = await fetch(`/api/mobile/visits/${p.visitId}`, {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify({
            findings: p.findings,
            partsReplaced: p.partsReplaced,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return;
      }
      case "PHOTO_UPLOAD": {
        // Photos require multipart form; we can't replay them once the File
        // object is gone. Treat queued photo uploads as informational only —
        // the UI prevents queuing photos while offline (it just stages them
        // in memory). If we ever do queue them, they should be base64-encoded
        // into payload. For v1 this branch is a no-op.
        return;
      }
      default: {
        throw new Error(`Unknown action kind: ${(action as PendingAction).kind}`);
      }
    }
  };
}
