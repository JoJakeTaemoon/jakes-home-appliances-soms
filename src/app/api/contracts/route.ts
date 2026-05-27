/**
 * GET  /api/contracts — paginated list with filters.
 * POST /api/contracts — create DRAFT contract.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  canViewContract,
  canCreateContract,
} from "@/lib/contracts/access";
import {
  contractListQuerySchema,
  createContractSchema,
} from "@/lib/validators/contract";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { allocateContractCode } from "@/lib/contracts/code";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canViewContract(auth.role)) {
      throw new ForbiddenError("Cannot view contracts");
    }

    const url = new URL(request.url);
    const parsed = contractListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid query",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { q, customerId, type, state, endingBefore, page, pageSize } = parsed.data;

    const where: Prisma.ContractWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (type) where.type = type;
    if (state) where.state = state;
    if (endingBefore) where.endDate = { lte: endingBefore };
    if (q) {
      const term = q.trim();
      where.OR = [
        { contractNumber: { contains: term, mode: "insensitive" } },
        { customer: { name: { contains: term, mode: "insensitive" } } },
        { customer: { code: { contains: term, mode: "insensitive" } } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.contract.count({ where }),
      prisma.contract.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true, type: true } },
          _count: { select: { equipment: true, amendments: true } },
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
    if (!canCreateContract(auth.role)) {
      throw new ForbiddenError("Cannot create contracts");
    }

    const body = await request.json().catch(() => null);
    const parsed = createContractSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid contract payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, code: true, type: true, shortcode: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");
    if (customer.type === "B2B" && !customer.shortcode) {
      throw new ValidationError("B2B customer needs a shortcode before issuing a contract");
    }

    // Validate equipment belongs to the customer.
    const equipmentIds = data.equipment.map((l) => l.equipmentId);
    const equipmentRows = await prisma.equipment.findMany({
      where: { id: { in: equipmentIds } },
      select: { id: true, customerId: true, siteId: true, status: true },
    });
    if (equipmentRows.length !== equipmentIds.length) {
      throw new ValidationError("One or more equipment items not found");
    }
    for (const e of equipmentRows) {
      if (e.customerId !== customer.id) {
        throw new ValidationError("Equipment must belong to the chosen customer");
      }
    }

    // For B2B, all equipment should share a single Site (recommended; warn but not block).
    if (customer.type === "B2B") {
      const siteIds = new Set(equipmentRows.map((e) => e.siteId).filter(Boolean));
      // We tolerate multi-site contracts (a B2B can deploy across sites) but
      // disallow mixing a site-equipment with no-site equipment.
      const hasNoSite = equipmentRows.some((e) => !e.siteId);
      if (hasNoSite && siteIds.size > 0) {
        throw new ValidationError("B2B contract cannot mix site-attached and unattached equipment");
      }
    }

    const signedAt = data.signedAt ?? new Date();
    const contractNumber = allocateContractCode({
      customer: { type: customer.type, code: customer.code, shortcode: customer.shortcode },
      type: data.type,
      signedAt,
    });

    const start = data.startDate ?? null;
    let endDate: Date | null = null;
    let termMonths: number | null = null;
    let monthlyFee: number | null = null;
    let totalValue: number | null = null;

    if (data.type === "RENTAL") {
      termMonths = data.termMonths;
      monthlyFee = data.monthlyMaintenanceFee ?? null;
      if (start) {
        endDate = new Date(start.getTime() + termMonths * 30 * 24 * 60 * 60 * 1000);
      }
    } else if (data.type === "MAINTENANCE") {
      termMonths = data.termMonths ?? null;
      monthlyFee = data.monthlyMaintenanceFee ?? null;
      if (start && termMonths) {
        endDate = new Date(start.getTime() + termMonths * 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      totalValue = data.totalContractValue ?? null;
    }

    const created = await prisma.contract.create({
      data: {
        contractNumber,
        customerId: customer.id,
        type: data.type,
        state: "DRAFT",
        startDate: start,
        endDate,
        termMonths,
        monthlyMaintenanceFee: monthlyFee ?? undefined,
        totalContractValue: totalValue ?? undefined,
        equipment: {
          create: data.equipment.map((l) => ({
            equipmentId: l.equipmentId,
            unitPrice: l.unitPrice ?? undefined,
            quantity: l.quantity,
            notes: l.notes ?? undefined,
          })),
        },
      },
      include: {
        customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
        equipment: { include: { equipment: { include: { model: true } } } },
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_CREATE",
      entityType: "Contract",
      entityId: created.id,
      after: { contractNumber: created.contractNumber, type: created.type, state: created.state },
      request,
    });

    return successResponse(created, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
