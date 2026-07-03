/**
 * GET /api/sales-reps/[id]/receivables?from=&to=
 *
 * Outstanding receivables for one sales rep, grouped by customer with
 * each payment's linked equipment (direct via Payment.equipmentId, or
 * fallback to the contract's equipment list when the payment isn't tied
 * to a specific unit) so the "기간별 미수금" tab can show what device the
 * unpaid amount actually belongs to.
 *
 * Filter: Payment.dueDate ∈ [from, to] AND customer.salesRepId = id AND
 * Payment.state ∈ EXPECTED|OVERDUE_*.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";

const paramsSchema = z.object({ id: z.string() });
const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const GET = defineQuery({
  audience: "staff",
  params: paramsSchema,
  query: querySchema,
  handler: async ({ params, query }) => {
    const { from, to } = query;
    const payments = await prisma.payment.findMany({
      where: {
        customer: { salesRepId: params.id },
        state: { in: ["EXPECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"] },
        ...(from || to
          ? {
              dueDate: {
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
        contract: {
          select: {
            id: true,
            contractNumber: true,
            type: true,
            equipment: {
              include: {
                equipment: {
                  select: {
                    id: true,
                    serialNumber: true,
                    customDescription: true,
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
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            customDescription: true,
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
      orderBy: { dueDate: "asc" },
    });

    interface EqRow {
      id: string;
      serialNumber: string | null;
      customDescription: string | null;
      monthlyFee: string | null;
      model: {
        modelCode: string | null;
        nameKo: string | null;
        nameVi: string | null;
        nameEn: string | null;
      } | null;
    }
    interface PaymentRow {
      id: string;
      kind: string;
      state: string;
      dueDate: string | null;
      expectedAmount: string;
      actualAmount: string;
      outstanding: number;
      notes: string | null;
      contract: { id: string; contractNumber: string; type: string } | null;
      /** Payment.equipmentId direct hit, else contract.equipment[] fallback. */
      equipment: EqRow[];
    }
    interface CustomerGroup {
      id: string;
      code: string;
      name: string;
      type: "B2C" | "B2B";
      paymentCount: number;
      outstandingTotal: number;
      payments: PaymentRow[];
    }

    const byCustomer = new Map<string, CustomerGroup>();
    let totalReceivable = 0;
    let totalPayments = 0;

    for (const p of payments) {
      const outstanding = Math.max(
        0,
        Number(p.expectedAmount ?? 0) - Number(p.actualAmount ?? 0),
      );
      totalReceivable += outstanding;
      totalPayments += 1;

      let equipment: EqRow[];
      if (p.equipment) {
        // Direct link wins — that's the device the cashier marked.
        equipment = [
          {
            id: p.equipment.id,
            serialNumber: p.equipment.serialNumber,
            customDescription: p.equipment.customDescription,
            monthlyFee: p.equipment.monthlyFee?.toString() ?? null,
            model: p.equipment.model
              ? {
                  modelCode: p.equipment.model.modelCode,
                  nameKo: p.equipment.model.nameKo,
                  nameVi: p.equipment.model.nameVi,
                  nameEn: p.equipment.model.nameEn,
                }
              : null,
          },
        ];
      } else if (p.contract) {
        // Fallback: list everything attached to the contract so the
        // office still sees which units the fee covers.
        equipment = p.contract.equipment.map((ce) => ({
          id: ce.equipment.id,
          serialNumber: ce.equipment.serialNumber,
          customDescription: ce.equipment.customDescription,
          monthlyFee: ce.equipment.monthlyFee?.toString() ?? null,
          model: ce.equipment.model
            ? {
                modelCode: ce.equipment.model.modelCode,
                nameKo: ce.equipment.model.nameKo,
                nameVi: ce.equipment.model.nameVi,
                nameEn: ce.equipment.model.nameEn,
              }
            : null,
        }));
      } else {
        equipment = [];
      }

      const row: PaymentRow = {
        id: p.id,
        kind: p.kind,
        state: p.state,
        dueDate: p.dueDate?.toISOString() ?? null,
        expectedAmount: p.expectedAmount.toString(),
        actualAmount: p.actualAmount.toString(),
        outstanding,
        notes: p.notes,
        contract: p.contract
          ? {
              id: p.contract.id,
              contractNumber: p.contract.contractNumber,
              type: p.contract.type,
            }
          : null,
        equipment,
      };

      const existing = byCustomer.get(p.customer.id);
      if (existing) {
        existing.payments.push(row);
        existing.paymentCount += 1;
        existing.outstandingTotal += outstanding;
      } else {
        byCustomer.set(p.customer.id, {
          id: p.customer.id,
          code: p.customer.code,
          name: p.customer.name,
          type: p.customer.type,
          paymentCount: 1,
          outstandingTotal: outstanding,
          payments: [row],
        });
      }
    }

    // Largest balance first — escalation priority.
    const customers = Array.from(byCustomer.values()).sort(
      (a, b) => b.outstandingTotal - a.outstandingTotal,
    );

    return {
      customers,
      totalReceivable,
      totalPayments,
      totalCustomers: customers.length,
    };
  },
});
