/**
 * GET /api/dev/mock-sms/stream
 *
 * Server-Sent Events feed of mock notification dispatches. Only enabled
 * when `SMS_PROVIDER === "mock"` AND `NODE_ENV !== "production"` — anything
 * else returns 404 so real production traffic can never leak SMS / email
 * bodies to a browser tab.
 *
 * On connect: replays the in-memory ring buffer (last 50) so a late-joining
 * tab still sees what just happened. Then streams new dispatches in
 * real-time via the mock-bus EventEmitter.
 */

import type { NextRequest } from "next/server";
import {
  getRecentMockDispatches,
  subscribeMockDispatch,
  type MockDispatchEvent,
} from "@/lib/notifications/mock-bus";

export const dynamic = "force-dynamic";

function isEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const sms = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();
  const email = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
  // Stream whenever EITHER channel is mocked — the bus only carries mock
  // events anyway, so non-mock channels just stay silent on the wire.
  return sms === "mock" || email === "mock";
}

function encode(evt: MockDispatchEvent): string {
  return `event: dispatch\ndata: ${JSON.stringify(evt)}\n\n`;
}

export async function GET(request: NextRequest) {
  if (!isEnabled()) {
    return new Response("Mock SMS stream disabled", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          // Stream is closed — cleanup happens in cancel().
        }
      };

      // Initial hello so the browser knows the connection is live.
      write(`: connected ${new Date().toISOString()}\n\n`);

      // Replay recent buffer first.
      for (const evt of getRecentMockDispatches()) {
        write(encode(evt));
      }

      // Then live subscription.
      const unsubscribe = subscribeMockDispatch((evt) => write(encode(evt)));

      // Heartbeat keeps proxies / browsers from idling the connection out.
      const heartbeat = setInterval(() => write(`: heartbeat\n\n`), 25_000);

      // Cleanup when the client disconnects.
      const abort = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable buffering for proxies that respect it (nginx etc.).
      "X-Accel-Buffering": "no",
    },
  });
}
