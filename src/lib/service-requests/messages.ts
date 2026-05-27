/**
 * Service-request message thread via AuditLog (Phase 7).
 *
 * Per the PRD recommendation we don't add a new schema table; instead we
 * use AuditLog with `action='SR_MESSAGE'` and the body in `after.message`.
 * Queries return them in chronological order keyed by `entityType='ServiceRequest'`
 * + `entityId=<srId>` + `action='SR_MESSAGE'`.
 */

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export type MessageAuthor = "CUSTOMER" | "OFFICE";

export interface SrMessage {
  id: string;
  at: string;
  author: MessageAuthor;
  authorName: string;
  body: string;
}

interface AuditAfter {
  message?: string;
  authorName?: string;
}

export async function listSrMessages(srId: string): Promise<SrMessage[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "SR_MESSAGE",
      entityType: "ServiceRequest",
      entityId: srId,
    },
    orderBy: { at: "asc" },
    include: {
      actorUser: { select: { id: true, username: true } },
    },
  });
  return rows.map((r) => {
    const after = (r.after ?? {}) as AuditAfter;
    return {
      id: r.id,
      at: r.at.toISOString(),
      author: r.actorType === "CUSTOMER" ? "CUSTOMER" : "OFFICE",
      authorName: r.actorUser?.username ?? after.authorName ?? "—",
      body: after.message ?? "",
    };
  });
}

export interface AppendInput {
  srId: string;
  body: string;
  author: MessageAuthor;
  actorId: string | null;
  authorName: string;
  request?: import("next/server").NextRequest | null;
}

export async function appendSrMessage(input: AppendInput): Promise<void> {
  const body = input.body.trim();
  if (body.length === 0) throw new Error("Empty message");
  await logAudit({
    actorType: input.author === "CUSTOMER" ? "CUSTOMER" : "USER",
    actorId: input.actorId,
    action: "SR_MESSAGE",
    entityType: "ServiceRequest",
    entityId: input.srId,
    after: {
      message: body,
      authorName: input.authorName,
    },
    request: input.request ?? null,
  });
}
