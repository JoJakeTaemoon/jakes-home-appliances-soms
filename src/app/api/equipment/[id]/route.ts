/**
 * GET   /api/equipment/[id]
 * PATCH /api/equipment/[id]
 *
 * GET migrated to `defineQuery`. PATCH keeps the manual shape to preserve
 * the AuditLog `before:` pre-image.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { updateEquipmentSchema } from "@/lib/validators/equipment";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

const paramsSchema = z.object({ id: z.string() });

interface Ctx {
  params: Promise<{ id: string }>;
}

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  handler: async ({ params }) => {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params.id },
      include: {
        customer: { select: { id: true, code: true, name: true, type: true } },
        site: { select: { id: true, name: true, address: true } },
        model: true,
        contracts: { include: { contract: true } },
        registeredBy: { select: { id: true, username: true } },
      },
    });
    if (!equipment) throw new NotFoundError("Equipment not found");
    // installedBy technician — separate query since the field is just an id.
    const installedByTechnician = equipment.installedByTechnicianId
      ? await prisma.user.findUnique({
          where: { id: equipment.installedByTechnicianId },
          select: { id: true, username: true },
        })
      : null;
    return { ...equipment, installedByTechnician };
  },
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
    const { id } = await ctx.params;

    const before = await prisma.equipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Equipment not found");

    const body = await request.json().catch(() => null);
    const parsed = updateEquipmentSchema.safeParse(body);
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

    // A site change must stay within the equipment's own customer — same
    // guard as the dedicated /move-site route.
    if (data.siteId) {
      const site = await prisma.site.findFirst({
        where: { id: data.siteId, customerId: before.customerId },
        select: { id: true },
      });
      if (!site) {
        throw new ValidationError("Target site does not belong to this customer");
      }
    }
    // Validate the model exists — same pre-check as create/register so a bad
    // id returns 400, not a raw FK-violation 500.
    if (data.modelId) {
      const model = await prisma.equipmentModel.findUnique({
        where: { id: data.modelId },
        select: { id: true },
      });
      if (!model) throw new ValidationError("Model not found");
    }

    // Prisma semantics do the branching for us: an `undefined` field is left
    // unchanged, `null` clears it, a value sets it — which is exactly how the
    // validator hands each field over (absent → undefined, explicit → null/value).
    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        serialNumber: data.serialNumber,
        // assetCode is immutable — issued once at registration.
        ownership: data.ownership,
        installedAt: data.installedAt,
        installedByTechnicianId: data.installedByTechnicianId ?? undefined,
        filterPolicyOverride:
          data.filterPolicyOverride === null
            ? undefined
            : (data.filterPolicyOverride as object | undefined),
        notes: data.notes,
        // Previously validated-but-dropped (silent no-op bug) — now persisted.
        customDescription: data.customDescription,
        customMaintenanceCycleDays: data.customMaintenanceCycleDays,
        // Newly editable: model, site, and SALE pricing.
        modelId: data.modelId,
        siteId: data.siteId,
        salePrice: data.salePrice,
        installFee: data.installFee,
        deposit: data.deposit,
        monthlyFee: data.monthlyFee,
        serviceType: data.serviceType,
        managementType: data.managementType,
        lifecycleStage: data.lifecycleStage,
        customInspectionCycleDays: data.customInspectionCycleDays,
        lastInspectionAtOverride: data.lastInspectionAtOverride,
        nextInspectionAtOverride: data.nextInspectionAtOverride,
        imageUrl: data.imageUrl,
      },
    });
    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "EQUIPMENT_UPDATE",
      entityType: "Equipment",
      entityId: id,
      before,
      after: updated,
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
