/**
 * GET /api/sales-reps/[id]/contracts?from=&to=
 *
 * Period revenue for one sales rep, grouped by customer with per-equipment
 * revenue breakdown. Revenue = money that actually came in during the
 * window (2026-07-03 policy — replaces the earlier "deposit + monthlyFee ×
 * 12" first-year book value):
 *
 *   1. Collected rental / equipment-sale payments — `Payment.actualAmount`
 *      where kind ∈ (RENTAL_FEE, SALE_PAYMENT), state ∈ (COLLECTED,
 *      HANDED_OVER, RECONCILED), collectedAt ∈ [from, to], customer's
 *      salesRepId = this rep.
 *   2. Paid consumable purchases — `OrderItem.totalPrice` where the item's
 *      unitPrice > 0 AND its productKind = CONSUMABLE AND the parent
 *      Order is not CANCELLED AND Order.orderedAt ∈ [from, to] AND
 *      customer's salesRepId = this rep.
 *
 * Deposits, deposit refunds, maintenance fees, and service fees are
 * excluded — the office asked for "rental fees and purchase amounts"
 * specifically. Adding them back is a one-enum edit if the definition
 * shifts.
 *
 * Equipment attribution per revenue item:
 *   - Payment.equipmentId set → attribute the full amount to that unit.
 *   - Payment has contract but no equipmentId → split the amount evenly
 *     across the contract's equipment rows.
 *   - Payment has neither → counted in customer totalValue only (no
 *     per-equipment row created).
 *   - OrderItem.equipmentId set → attribute to that unit.
 *   - OrderItem without equipmentId → counted in customer totalValue only.
 *
 * Legacy note: the URL still says "/contracts" because the sales-rep
 * detail page hits it under that name. Renaming the route would break
 * bookmarks and client-side query keys.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const paramsSchema = z.object({ id: z.string() });
const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const COLLECTED_STATES = ["COLLECTED", "HANDED_OVER", "RECONCILED"] as const;
const REVENUE_KINDS = ["RENTAL_FEE", "SALE_PAYMENT"] as const;

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ params, query }) => {
    const { from, to } = query;

    const collectedAtRange =
      from || to
        ? {
            collectedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};
    const orderedAtRange =
      from || to
        ? {
            orderedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const [payments, orders] = await Promise.all([
      prisma.payment.findMany({
        where: {
          customer: { salesRepId: params.id },
          kind: { in: [...REVENUE_KINDS] },
          state: { in: [...COLLECTED_STATES] },
          ...collectedAtRange,
        },
        include: {
          customer: {
            select: { id: true, code: true, name: true, type: true },
          },
          equipment: {
            select: {
              id: true,
              serialNumber: true,
              customDescription: true,
              installedAt: true,
              status: true,
              serviceType: true,
              managementType: true,
              lifecycleStage: true,
              monthlyFee: true,
              model: {
                select: {
                  modelCode: true,
                  nameKo: true,
                  nameVi: true,
                  nameEn: true,
                },
              },
            },
          },
          contract: {
            select: {
              equipment: {
                include: {
                  equipment: {
                    select: {
                      id: true,
                      serialNumber: true,
                      customDescription: true,
                      installedAt: true,
                      status: true,
                      serviceType: true,
                      managementType: true,
                      lifecycleStage: true,
                      monthlyFee: true,
                      model: {
                        select: {
                          modelCode: true,
                          nameKo: true,
                          nameVi: true,
                          nameEn: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: {
          customer: { salesRepId: params.id },
          state: { not: "CANCELLED" },
          ...orderedAtRange,
        },
        include: {
          customer: {
            select: { id: true, code: true, name: true, type: true },
          },
          items: {
            where: { productKind: "CONSUMABLE", unitPrice: { gt: 0 } },
            include: {
              equipment: {
                select: {
                  id: true,
                  serialNumber: true,
                  customDescription: true,
                  installedAt: true,
                  status: true,
                  serviceType: true,
                  managementType: true,
                  lifecycleStage: true,
                  monthlyFee: true,
                  model: {
                    select: {
                      modelCode: true,
                      nameKo: true,
                      nameVi: true,
                      nameEn: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    interface EqRow {
      id: string;
      serialNumber: string | null;
      customDescription: string | null;
      installedAt: string | null;
      status: string;
      serviceType: string | null;
      managementType: string | null;
      lifecycleStage: string;
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
      _equipmentById: Map<string, EqRow>;
    }

    const byCustomer = new Map<string, CustomerGroup>();

    function ensureCustomer(c: {
      id: string;
      code: string;
      name: string;
      type: "B2C" | "B2B";
    }): CustomerGroup {
      const existing = byCustomer.get(c.id);
      if (existing) return existing;
      const g: CustomerGroup = {
        id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        equipmentCount: 0,
        totalValue: 0,
        equipment: [],
        _equipmentById: new Map(),
      };
      byCustomer.set(c.id, g);
      return g;
    }

    type EqSource = NonNullable<(typeof payments)[number]["equipment"]>;
    function ensureEquipment(group: CustomerGroup, eq: EqSource): EqRow {
      const cached = group._equipmentById.get(eq.id);
      if (cached) return cached;
      const row: EqRow = {
        id: eq.id,
        serialNumber: eq.serialNumber,
        customDescription: eq.customDescription,
        installedAt: eq.installedAt?.toISOString() ?? null,
        status: eq.status,
        serviceType: eq.serviceType,
        managementType: eq.managementType,
        lifecycleStage: eq.lifecycleStage,
        monthlyFee: eq.monthlyFee?.toString() ?? null,
        revenue: 0,
        model: eq.model,
      };
      group.equipment.push(row);
      group._equipmentById.set(eq.id, row);
      group.equipmentCount += 1;
      return row;
    }

    for (const p of payments) {
      const amount = Number(p.actualAmount ?? 0);
      if (amount <= 0) continue;
      const group = ensureCustomer(p.customer);
      group.totalValue += amount;

      if (p.equipment) {
        ensureEquipment(group, p.equipment).revenue += amount;
      } else if (p.contract && p.contract.equipment.length > 0) {
        const eqs = p.contract.equipment.map((ce) => ce.equipment);
        const share = amount / eqs.length;
        for (const eq of eqs) {
          ensureEquipment(group, eq).revenue += share;
        }
      }
      // Payments without a direct equipment link and no contract sit at
      // the customer level only — visible in totalValue, absent from the
      // per-equipment table.
    }

    for (const o of orders) {
      const group = ensureCustomer(o.customer);
      for (const item of o.items) {
        const amount = Number(item.totalPrice ?? 0);
        if (amount <= 0) continue;
        group.totalValue += amount;
        if (item.equipment) {
          ensureEquipment(group, item.equipment).revenue += amount;
        }
        // Items without an equipment link (off-catalog purchase or one
        // that pre-dates the per-line link) show up in totalValue only.
      }
    }

    let totalValue = 0;
    let totalEquipment = 0;

    const customers = Array.from(byCustomer.values())
      .map(({ _equipmentById: _unused, ...c }) => {
        totalValue += c.totalValue;
        totalEquipment += c.equipmentCount;
        // Rank each customer's equipment by contribution — most-revenue
        // device first, matching how the office reads the report.
        c.equipment.sort((a, b) => b.revenue - a.revenue);
        return c;
      })
      .sort((a, b) => b.totalValue - a.totalValue);

    return {
      customers,
      totalValue,
      totalEquipment,
      totalCustomers: customers.length,
    };
  },
});
