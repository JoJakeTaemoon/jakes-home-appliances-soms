/**
 * GET /api/sales-reps/[id]/contracts?from=&to=
 *
 * Period revenue for one sales rep, grouped by customer with the
 * equipment installed for that customer during the period. Aggregation
 * is equipment-centric (2026-07-02 policy change) — the rep's numbers
 * roll up from the devices at their assigned customers, not from the
 * contract objects that happen to reference those customers.
 *
 * Filter: Equipment.installedAt ∈ [from, to] AND
 *         Equipment.customer.salesRepId = id AND
 *         Equipment.status != REPLACED  (replaced units get a fresh row).
 *
 * Per-equipment revenue: `deposit + monthlyFee × 12` — treats each
 * install as its "first-year book value", the number the rep is
 * usually credited with. Deposit is one-time; monthlyFee is the
 * recurring, so 12 months captures the annualized contribution
 * regardless of the contract's actual term. This matches how the
 * office already talks about "이번 달 매출" in the standup.
 *
 * Legacy note: the URL still says "/contracts" because the sales-rep
 * detail page hits it under that name. Response shape is now
 * equipment-first; renaming the route would break bookmarks and
 * client-side query keys, so we live with the misnomer for now.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const paramsSchema = z.object({ id: z.string() });
const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Standard annualization window for per-install book value. */
const REVENUE_MONTHS = 12;

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ params, query }) => {
    const { from, to } = query;
    const equipment = await prisma.equipment.findMany({
      where: {
        customer: { salesRepId: params.id },
        status: { not: "REPLACED" },
        ...(from || to
          ? {
              installedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        customer: {
          select: { id: true, code: true, name: true, type: true },
        },
        model: {
          select: {
            modelCode: true,
            nameKo: true,
            nameVi: true,
            nameEn: true,
          },
        },
      },
      orderBy: [{ installedAt: "desc" }, { createdAt: "desc" }],
    });

    interface EqRow {
      id: string;
      serialNumber: string | null;
      customDescription: string | null;
      installedAt: string | null;
      status: string;
      serviceType: string | null;
      managementType: string | null;
      lifecycleStage: string;
      deposit: string | null;
      monthlyFee: string | null;
      revenue: number;
      model: {
        modelCode: string | null;
        nameKo: string | null;
        nameVi: string | null;
        nameEn: string | null;
      } | null;
    }
    interface CustomerGroup {
      id: string;
      code: string;
      name: string;
      type: "B2C" | "B2B";
      equipmentCount: number;
      totalValue: number;
      equipment: EqRow[];
    }

    const byCustomer = new Map<string, CustomerGroup>();
    let totalValue = 0;
    let totalEquipment = 0;

    for (const eq of equipment) {
      const deposit = Number(eq.deposit ?? 0);
      const monthly = Number(eq.monthlyFee ?? 0);
      // First-year book value: one-time deposit + 12 recurring months.
      const revenue = deposit + monthly * REVENUE_MONTHS;
      totalValue += revenue;
      totalEquipment += 1;

      const eqRow: EqRow = {
        id: eq.id,
        serialNumber: eq.serialNumber,
        customDescription: eq.customDescription,
        installedAt: eq.installedAt?.toISOString() ?? null,
        status: eq.status,
        serviceType: eq.serviceType,
        managementType: eq.managementType,
        lifecycleStage: eq.lifecycleStage,
        deposit: eq.deposit?.toString() ?? null,
        monthlyFee: eq.monthlyFee?.toString() ?? null,
        revenue,
        model: eq.model
          ? {
              modelCode: eq.model.modelCode,
              nameKo: eq.model.nameKo,
              nameVi: eq.model.nameVi,
              nameEn: eq.model.nameEn,
            }
          : null,
      };

      const existing = byCustomer.get(eq.customer.id);
      if (existing) {
        existing.equipment.push(eqRow);
        existing.equipmentCount += 1;
        existing.totalValue += revenue;
      } else {
        byCustomer.set(eq.customer.id, {
          id: eq.customer.id,
          code: eq.customer.code,
          name: eq.customer.name,
          type: eq.customer.type,
          equipmentCount: 1,
          totalValue: revenue,
          equipment: [eqRow],
        });
      }
    }

    // Highest-revenue customer first — matches the office's
    // "who's the top mover this month" glance.
    const customers = Array.from(byCustomer.values()).sort(
      (a, b) => b.totalValue - a.totalValue,
    );

    return {
      customers,
      totalValue,
      totalEquipment,
      totalCustomers: customers.length,
      revenueMonths: REVENUE_MONTHS,
    };
  },
});
