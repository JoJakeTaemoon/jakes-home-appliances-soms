"use client";

/**
 * Dev-only listener that pipes mock SMS / email dispatches into the browser
 * dev-tools console.
 *
 * Connects to `/api/dev/mock-sms/stream` via EventSource. If the server has
 * disabled the stream (production, or non-mock providers) the request 404s
 * and EventSource quietly retries — no UI surface, no errors.
 */

import { useEffect } from "react";

interface MockDispatch {
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

export function MockSmsLogger() {
  useEffect(() => {
    // EventSource throws synchronously on environments where it's not
    // defined (SSR has already handed off by here, but be defensive).
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const es = new EventSource("/api/dev/mock-sms/stream");

    const onDispatch = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as MockDispatch;
        const tag = data.channel === "SMS" ? "📱 MOCK SMS" : "✉️ MOCK EMAIL";
        const header = `${tag} → ${data.to}  [${data.templateCode} · ${data.locale}]`;
        // `console.group` lets the body collapse so the console stays scannable.
        console.groupCollapsed(`%c${header}`, "color:#0071BD;font-weight:600");
        if (data.subject) console.log("subject :", data.subject);
        if (data.segmentsUsed) console.log("segments:", data.segmentsUsed);
        console.log("messageId:", data.messageId);
        console.log("body:\n" + data.body);
        console.groupEnd();
      } catch (err) {
        console.warn("[mock-sms-logger] failed to parse event", err);
      }
    };

    es.addEventListener("dispatch", onDispatch as EventListener);
    // Silently swallow errors — the stream may be disabled (404) and we
    // don't want to clutter the console while EventSource retries.
    es.addEventListener("error", () => {
      /* noop */
    });

    return () => {
      es.removeEventListener("dispatch", onDispatch as EventListener);
      es.close();
    };
  }, []);

  return null;
}
