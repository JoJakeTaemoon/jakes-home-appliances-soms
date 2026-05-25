import prisma from '@/lib/prisma';
import type { NextRequest } from 'next/server';

export type ActionType =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'REORDER'
  | 'PROJECT_WORK_PACKAGE_REORDER';

export interface LogActionParams {
  userId?: string | null;
  action: ActionType;
  resource: string;
  resourceId?: string | null;
  detail?: Record<string, unknown> | null;
  request?: NextRequest;
}

function getIpAddress(request?: NextRequest): string | null {
  if (!request) return null;
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

/**
 * Pull the request's path + query (no host) and HTTP method off a NextRequest.
 * Returns `{ url: null, method: null }` if no request was passed or the URL
 * fails to parse — never throws, since logAction itself is fire-and-forget.
 *
 * We strip the host so localhost vs prod entries are visually identical in
 * the activity log. The DB column caps at 2048 chars for safety against
 * pathological query strings.
 */
function getEndpoint(request?: NextRequest): { url: string | null; method: string | null } {
  if (!request) return { url: null, method: null };
  try {
    const u = new URL(request.url);
    const pathAndQuery = u.pathname + u.search;
    return {
      url: pathAndQuery.length > 2048 ? pathAndQuery.slice(0, 2048) : pathAndQuery,
      method: request.method,
    };
  } catch {
    return { url: null, method: request.method ?? null };
  }
}

/**
 * Diff helper for UPDATE logs. Builds a `{ changes: { field: { from, to } } }`
 * payload by comparing `before` (row snapshot taken pre-update) against
 * `after` (the patch the caller actually applied — usually the validated
 * Zod payload). Only fields whose value actually changed are included.
 *
 * Use this as `detail: buildUpdateDetail(before, after)` when calling
 * `logAction` so the activity-log modal can render an attribute-level diff
 * instead of a wall of JSON.
 *
 * Notes:
 *   - Equality is `JSON.stringify` based, which handles primitives, arrays
 *     and plain objects. Date instances are stringified to ISO; if a row
 *     uses Decimal/BigInt, coerce to string before passing in.
 *   - If you only have the patch (no before snapshot), prefer passing
 *     `{ patch: parsed.data }` so the modal still shows the fields the
 *     caller intended to set, just without "from".
 */
export function buildUpdateDetail(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { changes: Record<string, { from: unknown; to: unknown }> } {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const next = after[key];
    if (next === undefined) continue;
    const prev = before[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[key] = { from: prev ?? null, to: next };
    }
  }
  return { changes };
}

/**
 * Snapshot helper for DELETE logs. Wraps the row being deleted under a
 * `deleted` key so the activity-log modal can render it as a labelled
 * payload rather than a raw object dump.
 */
export function buildDeleteDetail(
  row: Record<string, unknown>,
): { deleted: Record<string, unknown> } {
  return { deleted: row };
}

/**
 * Log an action asynchronously (fire-and-forget).
 * Never throws — errors are silently logged to console.
 */
export function logAction(params: LogActionParams): void {
  const { userId, action, resource, resourceId, detail, request } = params;
  const { url: requestUrl, method: requestMethod } = getEndpoint(request);

  prisma.actionLog
    .create({
      data: {
        userId: userId || null,
        action,
        resource,
        resourceId: resourceId || null,
        requestUrl,
        requestMethod,
        detail: (detail as Record<string, string>) || undefined,
        ipAddress: getIpAddress(request),
      },
    })
    .catch((err) => {
      console.error('[ActionLog] Failed to write log:', err);
    });
}
