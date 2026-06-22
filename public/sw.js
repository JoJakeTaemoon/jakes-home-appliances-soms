/* eslint-disable no-restricted-globals */
/**
 * Jake's Home Appliances SOMS — minimal service worker for the technician mobile PWA.
 *
 * Strategy:
 *   - Cache the mobile shell on install (best-effort; missing assets are OK).
 *   - Network-first for /api/mobile GETs with a cache fallback.
 *   - For non-GET API calls while offline, respond 202 + a "queued" envelope;
 *     the main thread enqueues the actual action via Dexie (we can't replay
 *     bearer-authed mutations from the SW context reliably).
 *   - Bypass everything else (HTML, JS, CSS) — Next.js handles those.
 *
 * Intentionally hand-rolled (no Workbox) per the local-first scope.
 */

const SW_VERSION = "soms-sw-v1";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const API_CACHE = `${SW_VERSION}-api`;

const SHELL_URLS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Same-origin only
  if (url.origin !== self.location.origin) return;

  const isApi = url.pathname.startsWith("/api/");
  const isMobileApi = url.pathname.startsWith("/api/mobile/");

  // GET to /api/mobile/* → network-first, cache fallback
  if (req.method === "GET" && isMobileApi) {
    event.respondWith(networkFirstWithCache(req));
    return;
  }

  // Non-GET to /api/mobile/* while offline → return queued envelope
  if (req.method !== "GET" && isApi && !self.navigator.onLine) {
    event.respondWith(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "OFFLINE_QUEUED",
            message:
              "Request queued for sync — will retry when connection is restored.",
          },
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    return;
  }

  // Default: let it through
});

async function networkFirstWithCache(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      // Clone response into cache for future offline reads
      try {
        cache.put(req, fresh.clone());
      } catch {
        /* opaque / unsupported — ignore */
      }
    }
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "OFFLINE", message: "No cached response available." },
      }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
