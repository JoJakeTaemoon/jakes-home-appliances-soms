/**
 * GET /api/mobile/visits/[id]/suggest-consumables
 *
 * Returns the prefilled consumable recommendations for the mobile complete
 * screen. Lead-only (read access mirrors complete-write access since we
 * don't want collaborators seeing different prefill than the lead).
 *
 * No window override — uses the default ±30 days from the visit's
 * scheduled date.
 */

import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { suggestConsumablesForVisit } from "@/lib/visits/suggest";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "field",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const current = await VisitWorkflow.getById(params.id);
    if (!VisitWorkflow.access.canTechnicianView(auth, current)) {
      throw new NotFoundError("Visit not found");
    }
    if (!current.equipmentId) {
      // Visit isn't bound to a specific Equipment — nothing to suggest.
      return { recommendations: [] };
    }
    const visitDate = current.scheduledFor ?? new Date();
    if (Number.isNaN(visitDate.getTime())) {
      throw new ValidationError("Visit has no valid scheduled date", []);
    }
    const recommendations = await suggestConsumablesForVisit(
      current.equipmentId,
      visitDate,
      { isPeriodicInspection: current.type === "PERIODIC_INSPECTION" },
    );
    return {
      recommendations: recommendations.map((r) => ({
        consumableId: r.consumableId,
        sku: r.sku,
        nameKo: r.nameKo,
        nameVi: r.nameVi,
        nameEn: r.nameEn,
        action: r.action,
        lastDoneAt: r.lastDoneAt?.toISOString() ?? null,
        nextDueAt: r.nextDueAt.toISOString(),
        daysUntilDue: r.daysUntilDue,
        cycleMonths: r.cycleMonths,
      })),
    };
  },
});
