/**
 * GET  /api/admin/products/charge-policies  → list (paginated).
 * POST /api/admin/products/charge-policies  → upsert override (MANAGER+).
 *
 * A row here is an EXCEPTION to the default rule in
 * `src/lib/charge-policy.ts`. When no row exists for a given
 * (part, contractType, withinWarranty) tuple, the default applies.
 */

import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageEquipmentModel } from "@/lib/customers/access";
import {
  createChargePolicySchema,
  chargePolicyListQuerySchema,
} from "@/lib/validators/product";
import { ForbiddenError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  query: chargePolicyListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { accessoryId, consumableId, contractType, page, pageSize } = query;
    const where: Prisma.ChargePolicyWhereInput = {};
    if (accessoryId) where.accessoryId = accessoryId;
    if (consumableId) where.consumableId = consumableId;
    if (contractType) where.contractType = contractType;
    const [total, rows] = await Promise.all([
      prisma.chargePolicy.count({ where }),
      prisma.chargePolicy.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          accessory: { select: { sku: true, nameVi: true } },
          consumable: { select: { sku: true, nameVi: true } },
        },
      }),
    ]);
    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipmentModel(auth.role)) {
      throw new ForbiddenError("MANAGER+ required");
    }
  },
  body: createChargePolicySchema,
  // Idempotent upsert — re-saving the same (part, contractType, withinWarranty)
  // returns 200, matching audit action CHARGE_POLICY_UPSERT semantics. (Was
  // 201, which mis-signalled "Created" on every re-save.)
  handler: async ({ body }) => {
    // Upsert by (part, contractType, withinWarranty) — admins re-saving
    // overwrites the previous override rather than 409-erroring.
    if (body.accessoryId) {
      return prisma.chargePolicy.upsert({
        where: {
          accessoryId_contractType_withinWarranty: {
            accessoryId: body.accessoryId,
            contractType: body.contractType,
            withinWarranty: body.withinWarranty,
          },
        },
        create: {
          accessoryId: body.accessoryId,
          contractType: body.contractType,
          withinWarranty: body.withinWarranty,
          isChargeable: body.isChargeable,
          notes: body.notes ?? null,
        },
        update: { isChargeable: body.isChargeable, notes: body.notes ?? null },
      });
    }
    return prisma.chargePolicy.upsert({
      where: {
        consumableId_contractType_withinWarranty: {
          consumableId: body.consumableId!,
          contractType: body.contractType,
          withinWarranty: body.withinWarranty,
        },
      },
      create: {
        consumableId: body.consumableId!,
        contractType: body.contractType,
        withinWarranty: body.withinWarranty,
        isChargeable: body.isChargeable,
        notes: body.notes ?? null,
      },
      update: { isChargeable: body.isChargeable, notes: body.notes ?? null },
    });
  },
  audit: {
    action: "CHARGE_POLICY_UPSERT",
    entityType: "ChargePolicy",
    after: (r) => r,
  },
});
