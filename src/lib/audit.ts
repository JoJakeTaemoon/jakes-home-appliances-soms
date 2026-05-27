/**
 * Audit log writer.
 *
 * Wraps `prisma.auditLog.create` with a `logAudit` helper that never throws —
 * an audit-log failure must never block a business action. Call sites pass
 * either a NextRequest (so we can capture IP / UA) or pre-extracted strings.
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import type { ActorType } from "@/generated/prisma/client";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_RESET_BY_STAFF"
  | "PASSWORD_CHANGE"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DISABLE"
  | string; // future actions

export interface LogAuditParams {
  actorType: ActorType;
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  request?: NextRequest | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function getIpAddress(request?: NextRequest | null): string | null {
  if (!request) return null;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

/**
 * Fire-and-forget audit write. Errors are logged to console only.
 *
 * Use `await` when the audit row must be persisted before responding (e.g.
 * compliance-critical paths); otherwise drop the await and let the request
 * complete while the row writes asynchronously.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  const {
    actorType,
    actorId,
    action,
    entityType,
    entityId,
    before,
    after,
    request,
  } = params;

  const ipAddress = params.ipAddress ?? getIpAddress(request);
  const userAgent =
    params.userAgent ?? request?.headers.get("user-agent") ?? null;

  try {
    await prisma.auditLog.create({
      data: {
        actorType,
        actorId: actorId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        before: (before ?? undefined) as never,
        after: (after ?? undefined) as never,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[Audit] Failed to write audit log:", err);
  }
}
