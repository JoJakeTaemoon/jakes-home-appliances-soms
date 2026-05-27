/**
 * DB-backed template overrides (Phase 7 — UC-AD-04).
 *
 * Admin saves a per-locale body/subject in `NotificationTemplate`. The
 * provider lookup at send-time calls `getOverride(code, locale)`; if a
 * matching row exists, the override replaces the file-based default.
 *
 * Cached in-memory for 60s to avoid hitting the DB on the hot path of
 * every queued send. Cache is cleared on every successful upsert.
 */

import prisma from "@/lib/prisma";
import type { Locale } from "@/generated/prisma/client";

export interface TemplateOverride {
  body: string;
  subject: string | null;
}

type CacheKey = string;
const CACHE_TTL_MS = 60_000;
const cache = new Map<CacheKey, { value: TemplateOverride | null; expiresAt: number }>();

function key(code: string, locale: Locale): CacheKey {
  return `${code}::${locale}`;
}

/** Get the override for (code, locale) — null if none. Cached 60s. */
export async function getOverride(
  code: string,
  locale: Locale,
): Promise<TemplateOverride | null> {
  const k = key(code, locale);
  const hit = cache.get(k);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;

  let row: { body: string; subject: string | null } | null = null;
  try {
    row = await prisma.notificationTemplate.findUnique({
      where: { code_locale: { code, locale } },
      select: { body: true, subject: true },
    });
  } catch {
    // DB unreachable — degrade silently; the file defaults will be used.
    cache.set(k, { value: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }
  const value: TemplateOverride | null = row
    ? { body: row.body, subject: row.subject ?? null }
    : null;
  cache.set(k, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/** Clear the cache. Called from the admin save handler. */
export function clearOverrideCache(): void {
  cache.clear();
}

/** Test helper. */
export function __resetOverrideCacheForTest(): void {
  cache.clear();
}
