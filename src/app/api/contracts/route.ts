/**
 * GET  /api/contracts — paginated list with filters.
 * POST /api/contracts — create DRAFT contract.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import {
  contractListQuerySchema,
  createContractSchema,
} from "@/lib/validators/contract";
import { ForbiddenError } from "@/lib/api/error";
import { resolveOrderBy, type SortMap } from "@/lib/api/sort";
import type { Prisma } from "@/generated/prisma/client";

const CONTRACT_SORT_MAP: SortMap<Prisma.ContractOrderByWithRelationInput> = {
  contractNumber: (dir) => ({ contractNumber: dir }),
  type: (dir) => ({ type: dir }),
  state: (dir) => ({ state: dir }),
  startDate: (dir) => ({ startDate: dir }),
  endDate: (dir) => ({ endDate: dir }),
  monthlyMaintenanceFee: (dir) => ({ monthlyMaintenanceFee: dir }),
  customer: (dir) => ({ customer: { code: dir } }),
  createdAt: (dir) => ({ createdAt: dir }),
};

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!ContractWorkflow.access.canView(auth.role)) {
      throw new ForbiddenError("Cannot view contracts");
    }
  },
  query: contractListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const {
      q,
      customerId,
      type,
      state,
      endingBefore,
      customerType,
      startDateFrom,
      startDateTo,
      sortBy,
      sortDir,
      page,
      pageSize,
    } = query;
    const orderBy = resolveOrderBy({ sortBy, sortDir }, CONTRACT_SORT_MAP, { createdAt: "desc" });

    const where: Prisma.ContractWhereInput = {};
    if (customerId) where.customerId = customerId;
    if (type) where.type = type;
    if (state) where.state = state;
    if (endingBefore) where.endDate = { lte: endingBefore };
    if (customerType) where.customer = { type: customerType };
    if (startDateFrom || startDateTo) {
      where.startDate = {
        ...(startDateFrom ? { gte: startDateFrom } : {}),
        ...(startDateTo ? { lte: startDateTo } : {}),
      };
    }
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
        orderBy,
        skip,
        take: pageSize,
        include: {
          customer: {
            select: { id: true, code: true, name: true, type: true },
          },
          _count: { select: { equipment: true, amendments: true } },
        },
      }),
    ]);

    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!ContractWorkflow.access.canCreate(auth.role)) {
      throw new ForbiddenError("Cannot create contracts");
    }
  },
  body: createContractSchema,
  successStatus: 201,
  handler: ({ auth, body, request }) => {
    let termMonths: number | null = null;
    if (body.type === "RENTAL") termMonths = body.termMonths;
    else if (body.type === "MAINTENANCE") termMonths = body.termMonths ?? null;

    return ContractWorkflow.create(
      {
        customerId: body.customerId,
        type: body.type,
        equipment: body.equipment.map((l) => ({
          equipmentId: l.equipmentId,
          unitPrice: l.unitPrice ?? null,
          quantity: l.quantity,
          notes: l.notes ?? null,
        })),
        signedAt: body.signedAt ?? undefined,
        startDate: body.startDate ?? null,
        termMonths,
        monthlyMaintenanceFee:
          body.type === "SALE" ? null : (body.monthlyMaintenanceFee ?? null),
        totalContractValue:
          body.type === "SALE" ? (body.totalContractValue ?? null) : null,
      },
      { userId: auth.userId, role: auth.role },
      request,
    );
  },
});
