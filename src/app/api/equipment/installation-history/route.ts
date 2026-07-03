/**
 * GET /api/equipment/installation-history
 *
 * Two views:
 *   - groupBy=batch  → AuditLog rows where action=EQUIPMENT_BULK_CREATE.
 *                      Each row carries the batch's equipment + visit ids
 *                      in `after.equipmentIds` / `after.visitIds`.
 *   - groupBy=visit  → INSTALLATION-type visits with state/customer/equipment
 *                      joined.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const queryParams = z.object({
  groupBy: z.enum(["batch", "visit"]).default("batch"),
  customerId: z.string().trim().min(1).optional(),
  technicianId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = defineQuery({
  audience: "staff",
  query: queryParams,
  paginated: true,
  handler: async ({ query }) => {
    const { groupBy, customerId, technicianId, from, to, page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    if (groupBy === "batch") {
      const where = {
        action: "EQUIPMENT_BULK_CREATE",
        ...(from || to
          ? {
              at: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { at: "desc" },
          skip,
          take: pageSize,
          include: {
            actorUser: { select: { id: true, username: true } },
          },
        }),
      ]);
      return { rows, pagination: { page, limit: pageSize, total } };
    }

    // groupBy=visit
    const where = {
      type: "INSTALLATION" as const,
      ...(customerId ? { customerId } : {}),
      ...(technicianId ? { leadTechnicianId: technicianId } : {}),
      ...(from || to
        ? {
            scheduledFor: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        orderBy: { scheduledFor: "desc" },
        skip,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true } },
          equipment: {
            include: { model: { select: { nameKo: true, nameVi: true, nameEn: true } } },
          },
          leadTechnician: { select: { id: true, username: true } },
        },
      }),
    ]);
    return { rows, pagination: { page, limit: pageSize, total } };
  },
});
