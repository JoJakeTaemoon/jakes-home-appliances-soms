/**
 * GET  /api/equipment — paginated list with filters.
 * POST /api/equipment — install new equipment for a customer.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import {
  createEquipmentSchema,
  equipmentListQuerySchema,
} from "@/lib/validators/equipment";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const parsed = equipmentListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid query",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { q, customerId, siteId, modelId, status, region, page, pageSize } = parsed.data;
    const where: Prisma.EquipmentWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (siteId) where.siteId = siteId;
    if (modelId) where.modelId = modelId;
    if (status) where.status = status;
    if (region) where.OR = [{ site: { region } }, { customer: { preferredRegion: region } }];
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
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true, type: true } },
          site: { select: { id: true, name: true, region: true } },
          model: { select: { id: true, modelCode: true, name: true, category: true } },
        },
      }),
    ]);
    return paginatedResponse(rows, { page, limit: pageSize, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");

    const body = await request.json().catch(() => null);
    const parsed = createEquipmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid equipment payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");

    if (data.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.siteId, customerId: data.customerId },
        select: { id: true },
      });
      if (!site) throw new NotFoundError("Site not found for customer");
    }

    const model = await prisma.equipmentModel.findUnique({
      where: { id: data.modelId },
      select: { id: true },
    });
    if (!model) throw new NotFoundError("Model not found");

    const created = await prisma.equipment.create({
      data: {
        customerId: data.customerId,
        siteId: data.siteId ?? null,
        modelId: data.modelId,
        serialNumber: data.serialNumber ?? null,
        ownership: data.ownership,
        installedAt: data.installedAt ?? null,
        installedByTechnicianId: data.installedByTechnicianId ?? null,
        notes: data.notes ?? null,
        status: "ACTIVE",
      },
      include: { model: true, site: true, customer: { select: { id: true, code: true, name: true } } },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_INSTALL",
      entityType: "Equipment",
      entityId: created.id,
      after: created,
      request,
    });
    return successResponse(created, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
