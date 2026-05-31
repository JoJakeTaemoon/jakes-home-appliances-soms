/**
 * GET  /api/equipment — paginated list with filters.
 * POST /api/equipment — install new equipment for a customer.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import {
  createEquipmentSchema,
  equipmentListQuerySchema,
} from "@/lib/validators/equipment";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { resolveOrderBy, type SortMap } from "@/lib/api/sort";
import type { Prisma } from "@/generated/prisma/client";

const EQUIPMENT_SORT_MAP: SortMap<Prisma.EquipmentOrderByWithRelationInput> = {
  serialNumber: (dir) => ({ serialNumber: dir }),
  status: (dir) => ({ status: dir }),
  installedAt: (dir) => ({ installedAt: dir }),
  ownership: (dir) => ({ ownership: dir }),
  customer: (dir) => ({ customer: { code: dir } }),
  model: (dir) => ({ model: { modelCode: dir } }),
  site: (dir) => ({ site: { name: dir } }),
  createdAt: (dir) => ({ createdAt: dir }),
};

export const GET = defineQuery({
  audience: "staff",
  query: equipmentListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, customerId, siteId, modelId, status, region, sortBy, sortDir, page, pageSize } =
      query;
    const orderBy = resolveOrderBy({ sortBy, sortDir }, EQUIPMENT_SORT_MAP, { createdAt: "desc" });
    const where: Prisma.EquipmentWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (siteId) where.siteId = siteId;
    if (modelId) where.modelId = modelId;
    if (status) where.status = status;
    if (region)
      where.OR = [{ site: { region } }, { customer: { preferredRegion: region } }];
    if (q) {
      where.AND = [
        {
          OR: [
            { serialNumber: { contains: q, mode: "insensitive" } },
            { customer: { code: { contains: q, mode: "insensitive" } } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { model: { modelCode: { contains: q, mode: "insensitive" } } },
            { model: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.equipment.count({ where }),
      prisma.equipment.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, code: true, name: true, type: true },
          },
          site: { select: { id: true, name: true, region: true } },
          model: {
            select: { id: true, modelCode: true, name: true, category: true },
          },
        },
      }),
    ]);
    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot manage equipment");
    }
  },
  body: createEquipmentSchema,
  successStatus: 201,
  handler: async ({ body }) => {
    const customer = await prisma.customer.findUnique({
      where: { id: body.customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    if (body.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: body.siteId, customerId: body.customerId },
        select: { id: true },
      });
      if (!site) throw new NotFoundError("Site not found for customer");
    }

    const model = await prisma.equipmentModel.findUnique({
      where: { id: body.modelId },
      select: { id: true },
    });
    if (!model) throw new NotFoundError("Model not found");

    return prisma.equipment.create({
      data: {
        customerId: body.customerId,
        siteId: body.siteId ?? null,
        modelId: body.modelId,
        serialNumber: body.serialNumber ?? null,
        ownership: body.ownership,
        installedAt: body.installedAt ?? null,
        installedByTechnicianId: body.installedByTechnicianId ?? null,
        notes: body.notes ?? null,
        status: "ACTIVE",
      },
      include: {
        model: true,
        site: true,
        customer: { select: { id: true, code: true, name: true } },
      },
    });
  },
  audit: {
    action: "EQUIPMENT_INSTALL",
    entityType: "Equipment",
    after: (r) => r,
  },
});
