/**
 * GET /api/service-requests/unread-count — number of SRs with at least one
 * unread customer message.
 *
 * Powers the sidebar nav badge. Available to all office roles. Polled
 * on a short interval (sidebar refetches every 60s) so the SQL is kept
 * cheap: a single grouped aggregate on AuditLog joined to SR's
 * lastOfficeReadAt.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!ServiceRequestWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Office role required");
    }
  },
  handler: async () => {
    // Latest customer SR_MESSAGE per SR
    const groups = await prisma.auditLog.groupBy({
      by: ["entityId"],
      where: {
        action: "SR_MESSAGE",
        actorType: "CUSTOMER",
        entityType: "ServiceRequest",
      },
      _max: { at: true },
    });
    if (groups.length === 0) return { count: 0 };
    const entityIds = groups
      .map((g) => g.entityId)
      .filter((id): id is string => id !== null);
    const srs = await prisma.serviceRequest.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, lastOfficeReadAt: true },
    });
    const lastReadById = new Map<string, Date | null>(
      srs.map((s) => [s.id, s.lastOfficeReadAt]),
    );
    let count = 0;
    for (const g of groups) {
      if (!g.entityId || !g._max.at) continue;
      const lastRead = lastReadById.get(g.entityId);
      // SR row may have been deleted between query and groupBy — skip.
      if (lastRead === undefined) continue;
      if (lastRead === null || lastRead < g._max.at) count++;
    }
    return { count };
  },
});
