/**
 * POST /api/contracts/[id]/equipment/bulk-install
 *
 * Contract-scoped equipment installation entry point (added 2026-06).
 *
 * Workflow:
 *   1. Office selects the contract first.
 *   2. Office adds one row per model and a quantity. The serialStart
 *      string is used as the prefix + incrementing suffix when present;
 *      otherwise the Equipment row is created with `serialNumber = null`.
 *   3. For customers with ≥2 active Sites, every item must carry a
 *      siteId — enforced server-side. Single-site / B2C customers may
 *      omit it.
 *
 * All created Equipment rows are linked to the contract via
 * `ContractEquipment` in the same transaction, so the contract's
 * "기기" badge updates atomically.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { canManageEquipment } from "@/lib/customers/access";
import {
  bulkInstallEquipmentSchema,
  generateSerialSequence,
} from "@/lib/validators/equipment";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageEquipment(auth.role))
      throw new ForbiddenError("Cannot manage equipment");
  },
  params: paramsSchema,
  body: bulkInstallEquipmentSchema,
  successStatus: 201,
  handler: async ({ params, body }) => {
    const contract = await prisma.contract.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        contractNumber: true,
        customerId: true,
        state: true,
        customer: {
          select: {
            id: true,
            sites: { where: { isActive: true }, select: { id: true } },
          },
        },
      },
    });
    if (!contract) throw new NotFoundError("Contract not found");

    const customerSites = contract.customer.sites;
    const requireSite = customerSites.length >= 2;
    const validSiteIds = new Set(customerSites.map((s) => s.id));

    // Validate every model + siteId up front so we either install
    // everything or nothing.
    const modelIds = Array.from(new Set(body.items.map((i) => i.modelId)));
    const models = await prisma.equipmentModel.findMany({
      where: { id: { in: modelIds } },
      select: { id: true },
    });
    const knownModelIds = new Set(models.map((m) => m.id));
    for (const [idx, it] of body.items.entries()) {
      if (!knownModelIds.has(it.modelId)) {
        throw new ValidationError(
          `items[${idx}].modelId — model not found`,
        );
      }
      if (requireSite && !it.siteId) {
        throw new ValidationError(
          `items[${idx}].siteId — required: customer has multiple sites`,
        );
      }
      if (it.siteId && !validSiteIds.has(it.siteId)) {
        throw new ValidationError(
          `items[${idx}].siteId — site does not belong to this customer`,
        );
      }
    }

    const installedAtDefault = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const out: { equipmentId: string; serialNumber: string | null }[] = [];
      for (const it of body.items) {
        const serials = generateSerialSequence(it.serialStart ?? null, it.quantity);
        for (let i = 0; i < it.quantity; i++) {
          const eq = await tx.equipment.create({
            data: {
              customerId: contract.customerId,
              siteId: it.siteId ?? null,
              modelId: it.modelId,
              serialNumber: serials[i],
              ownership: it.ownership,
              installedAt: it.installedAt ?? installedAtDefault,
              installedByTechnicianId: it.installedByTechnicianId ?? null,
              notes: it.notes ?? null,
              status: "ACTIVE",
            },
            select: { id: true, serialNumber: true },
          });
          await tx.contractEquipment.create({
            data: {
              contractId: contract.id,
              equipmentId: eq.id,
              unitPrice: it.unitPrice ?? null,
            },
          });
          out.push({ equipmentId: eq.id, serialNumber: eq.serialNumber });
        }
      }
      return out;
    });

    return {
      contractId: contract.id,
      created,
      count: created.length,
    };
  },
  audit: {
    action: "EQUIPMENT_BULK_INSTALL",
    entityType: "Contract",
    entityId: (_r, ctx) => ctx.params.id,
    after: (r) => r,
  },
});
