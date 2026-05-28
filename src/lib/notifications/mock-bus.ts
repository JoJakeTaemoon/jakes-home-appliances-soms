/**
 * In-memory bus for mock notification dispatches.
 *
 * Dev affordance only — gated on `SMS_PROVIDER === "mock"` /
 * `EMAIL_PROVIDER === "mock"` at the consumer side. Lets the browser
 * subscribe via `/api/dev/mock-sms/stream` and surface SMS / Email content
 * in the dev-tools console without anyone having to tail the server log.
 *
 * Two facts:
 *   - Ring buffer keeps the most recent 50 entries so a late-joining tab
 *     still sees what just happened.
 *   - EventEmitter is process-local; that's fine because this is dev-only
 *     and the dev server is single-process.
 */

import { EventEmitter } from "node:events";

export interface MockDispatchEvent {
  id: string;
  ts: number;
  channel: "SMS" | "EMAIL";
  to: string;
  templateCode: string;
  locale: string;
  subject?: string;
  body: string;
  segmentsUsed?: number;
  messageId: string;
}

const RING_SIZE = 50;
const ring: MockDispatchEvent[] = [];

// Persist the emitter on globalThis so HMR doesn't drop subscribers on
// every code-change in the Next dev server. Without this, each route
// reload would create a fresh emitter and existing browser tabs would
// silently fall off.
declare global {
  // eslint-disable-next-line no-var
  var __SA_MOCK_BUS__: EventEmitter | undefined;
}

const bus: EventEmitter =
  globalThis.__SA_MOCK_BUS__ ??
  (globalThis.__SA_MOCK_BUS__ = new EventEmitter().setMaxListeners(50));

export function publishMockDispatch(evt: MockDispatchEvent): void {
  ring.push(evt);
  if (ring.length > RING_SIZE) ring.shift();
  bus.emit("dispatch", evt);
}

export function getRecentMockDispatches(): MockDispatchEvent[] {
  return ring.slice();
}

export function subscribeMockDispatch(
  fn: (evt: MockDispatchEvent) => void,
): () => void {
  bus.on("dispatch", fn);
  return () => bus.off("dispatch", fn);
}
