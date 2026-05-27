/**
 * GET  /api/equipment-models — list (paginated).
 * POST /api/equipment-models — create model (MANAGER+).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createEquipmentModelSchema,
  equipmentModelListQuerySchema,
} from "@/lib/validators/equipmentModel";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request); // any authenticated office role
    const url = new URL(request.url);
    const parsed = equipmentModelListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid query",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { q, category, isActive, page, pageSize } = parsed.data;
    const where: Prisma.EquipmentModelWhereInput = {};
    if (category) where.category = category;
    if (typeof isActive === "boolean") where.isActive = isActive;
    if (q) {
      where.OR = [
        { modelCode: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      prisma.equipmentModel.count({ where }),
      prisma.equipmentModel.findMany({
        where,
        orderBy: { modelCode: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
    const body = await request.json().catch(() => null);
    const parsed = createEquipmentModelSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid model payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;
    const existing = await prisma.equipmentModel.findUnique({
      where: { modelCode: data.modelCode },
      select: { id: true },
    });
    if (existing) throw new ConflictError(`Model code ${data.modelCode} already exists`);

    const created = await prisma.equipmentModel.create({
      data: {
        modelCode: data.modelCode,
        name: data.name,
        category: data.category,
        description: data.description ?? null,
        retailPrice: data.retailPrice ?? null,
        monthlyRentalPrice: data.monthlyRentalPrice ?? null,
        monthlyMaintenancePrice: data.monthlyMaintenancePrice ?? null,
        filterPolicy: data.filterPolicy ?? undefined,
        isActive: data.isActive,
      },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_MODEL_CREATE",
      entityType: "EquipmentModel",
      entityId: created.id,
      after: created,
      request,
    });
    return successResponse(created, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
