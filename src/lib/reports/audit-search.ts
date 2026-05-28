/**
 * Audit log search (UC-RP-06).
 *
 * MANAGER+ sees everything; STAFF sees only their own AuditLog rows.
 * Filters: actorId, entityType, action, date range, free-text (matches
 * action ∥ entityType ∥ entityId ∥ stringified before/after). Paginated.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface AuditSearchInput {
  actorId?: string | null;
  entityType?: string | null;
  action?: string | null;
  start?: Date | null;
  end?: Date | null;
  q?: string | null;
  page: number;
  pageSize: number;
  /** Restrict to this actorId regardless of `actorId` filter (STAFF self-scope). */
  forceActorId?: string | null;
}

export interface AuditSearchRow {
  id: string;
  at: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditSearchResult {
  rows: AuditSearchRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function searchAuditLog(
  input: AuditSearchInput,
): Promise<AuditSearchResult> {
  const where: Prisma.AuditLogWhereInput = {};
  if (input.forceActorId) {
    where.actorId = input.forceActorId;
  } else if (input.actorId) {
    where.actorId = input.actorId;
  }
  if (input.entityType) where.entityType = input.entityType;
  if (input.action) where.action = input.action;
  if (input.start || input.end) {
    where.at = {};
    if (input.start) (where.at as { gte?: Date; lte?: Date }).gte = input.start;
    if (input.end) (where.at as { gte?: Date; lte?: Date }).lte = input.end;
  }
  if (input.q) {
    const q = input.q.trim();
    if (q.length > 0) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
      ];
    }
  }

  const page = Math.max(1, input.page);
  const pageSize = Math.min(200, Math.max(1, input.pageSize));
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        actorUser: { select: { id: true, username: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      actorType: r.actorType,
      actorId: r.actorId ?? null,
      actorName: r.actorUser?.username ?? null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId ?? null,
      ipAddress: r.ipAddress ?? null,
      userAgent: r.userAgent ?? null,
      before: r.before,
      after: r.after,
    })),
    total,
    page,
    pageSize,
  };
}
