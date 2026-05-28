/**
 * Recurring monthly Payment generator (UC-PY-01 / monthly cycle).
 *
 *   runMonthlyRecurringPayments({ month }) — for every ACTIVE rental OR
 *   maintenance contract with a `monthlyMaintenanceFee` (or its derived
 *   rental fee), insert an EXPECTED Payment row for the given month if one
 *   doesn't already exist.
 *
 *   Idempotent: the dedupe key is `(contractId, month-of-dueDate)`.
 *   `dueDate` is set to the 10th of the month (a common SOM convention —
 *   payable within 10 days of issue).
 */

import prisma from "@/lib/prisma";
import { createExpectedPayment } from "@/lib/payments/operations";

export interface RecurringRunSummary {
  contractsScanned: number;
  paymentsCreated: number;
  skippedExisting: number;
  skippedNoFee: number;
  errors: { contractId: string; error: string }[];
}

function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function lastOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));
}

function dueDateForMonth(d: Date): Date {
  // 10th of the month at 23:59 UTC
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 10, 23, 59, 59));
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function runMonthlyRecurringPayments(
  opts: { now?: Date } = {},
): Promise<RecurringRunSummary> {
  const now = opts.now ?? new Date();
  const month = firstOfMonth(now);
  const monthEnd = lastOfMonth(now);
  const due = dueDateForMonth(now);

  const summary: RecurringRunSummary = {
    contractsScanned: 0,
    paymentsCreated: 0,
    skippedExisting: 0,
    skippedNoFee: 0,
    errors: [],
  };

  const contracts = await prisma.contract.findMany({
    where: {
      state: "ACTIVE",
      type: { in: ["RENTAL", "MAINTENANCE"] },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
    select: {
      id: true,
      customerId: true,
      type: true,
      monthlyMaintenanceFee: true,
      equipment: {
        select: {
          unitPrice: true,
          quantity: true,
        },
      },
    },
  });
  summary.contractsScanned = contracts.length;

  for (const c of contracts) {
    try {
      let amount = 0;
      if (c.monthlyMaintenanceFee) {
        amount = Number(c.monthlyMaintenanceFee.toString());
      } else if (c.type === "RENTAL") {
        // Fall back to sum of equipment unit prices (rental monthly fee).
        amount = c.equipment.reduce((acc, ce) => {
          const unit = ce.unitPrice ? Number(ce.unitPrice.toString()) : 0;
          return acc + unit * (ce.quantity ?? 1);
        }, 0);
      }
      if (amount <= 0) {
        summary.skippedNoFee += 1;
        continue;
      }

      const existing = await prisma.payment.findFirst({
        where: {
          contractId: c.id,
          dueDate: { gte: month, lte: monthEnd },
        },
        select: { id: true },
      });
      if (existing) {
        summary.skippedExisting += 1;
        continue;
      }

      await createExpectedPayment({
        customerId: c.customerId,
        contractId: c.id,
        expectedAmount: amount,
        dueDate: due,
        source: `MONTHLY_${c.type}_${monthKey(now)}`,
        notes: `Auto-generated recurring ${c.type} payment for ${monthKey(now)}`,
        actorUserId: null,
      });
      summary.paymentsCreated += 1;
    } catch (err) {
      summary.errors.push({
        contractId: c.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
