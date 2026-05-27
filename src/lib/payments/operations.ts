/**
 * Payment business operations (Phase 6 — UC-PY-01..07).
 *
 * Every mutator returns the updated Payment row, writes an AuditLog and
 * never throws inside notification dispatch (failures here must not bounce
 * the user's primary action).
 */

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import {
  IllegalPaymentTransitionError,
  planPaymentTransition,
  type PaymentState,
} from "@/lib/payments/state";
import type { PaymentMethod } from "@/generated/prisma/client";
import { formatVnd, formatDate } from "@/lib/format";
import type { NotificationLocale } from "@/lib/notifications/types";

// ─────────────────────────────────────────────────────────────────────────
// Concurrency guard
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wraps `prisma.payment.update` with the prior state pinned in WHERE so two
 * concurrent transitions don't both succeed. If the state changed between
 * findUnique and update, Prisma throws P2025 (record not found) and we
 * surface a user-friendly message.
 */
async function updatePaymentWithStateGuard(args: {
  paymentId: string;
  expectedPriorState: PaymentState;
  data: Parameters<typeof prisma.payment.update>[0]["data"];
}) {
  try {
    return await prisma.payment.update({
      where: { id: args.paymentId, state: args.expectedPriorState },
      data: args.data,
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      throw new Error(
        "Payment state changed concurrently — refresh and try again",
      );
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Receipt helpers
// ─────────────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

function selectReceiptRecipient(
  contacts: {
    id: string;
    role: string;
    scope: string;
    siteId: string | null;
    isPrimary: boolean;
  }[],
): string | null {
  // Receipts route to the primary OPS contact (mirrors visit completion).
  // Fallback chain: site-scoped primary OPS → customer-scoped primary OPS →
  // any OPS → CONTRACT_PARTY.
  const ops = contacts.filter((c) => c.role === "OPS_CONTACT");
  const customerScoped = ops.find(
    (c) => c.scope === "CUSTOMER" && c.isPrimary,
  );
  if (customerScoped) return customerScoped.id;
  const anyPrimary = ops.find((c) => c.isPrimary);
  if (anyPrimary) return anyPrimary.id;
  if (ops[0]) return ops[0].id;
  const cp = contacts.find((c) => c.role === "CONTRACT_PARTY");
  return cp?.id ?? null;
}

async function queueReceiptEmail(opts: {
  paymentId: string;
  actorUserId: string | null;
}): Promise<number> {
  const payment = await prisma.payment.findUnique({
    where: { id: opts.paymentId },
    include: {
      customer: {
        select: {
          name: true,
          contacts: {
            select: {
              id: true,
              role: true,
              scope: true,
              siteId: true,
              isPrimary: true,
            },
          },
        },
      },
    },
  });
  if (!payment) return 0;

  const contactId = selectReceiptRecipient(payment.customer.contacts);
  if (!contactId) return 0;

  try {
    const results = await sendNotification({
      templateCode: "EMAIL_RECEIPT",
      customerContactId: contactId,
      vars: {
        name: payment.customer.name,
        receipt_no: payment.id.slice(-12).toUpperCase(),
        date: formatDate(payment.collectedAt ?? new Date(), "vi"),
        method: payment.method,
        amount: formatVnd(payment.actualAmount.toString()),
        hq_phone: "+84-28-1234-5678",
      },
      actorId: opts.actorUserId ?? null,
      actorType: opts.actorUserId ? "USER" : "SYSTEM",
    });
    return results.filter((r) => r.status !== "SKIPPED").length;
  } catch (err) {
    console.error("[payments] receipt notification failed:", err);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Create EXPECTED payment (UC-PY-01 — contract activation / monthly rent)
// ─────────────────────────────────────────────────────────────────────────

export interface CreateExpectedPaymentInput {
  customerId: string;
  contractId?: string | null;
  expectedAmount: number;
  dueDate: Date;
  method?: PaymentMethod;
  source?: string; // e.g. "MONTHLY_RENT_2026_06", "CONTRACT_ACTIVATION"
  notes?: string;
  actorUserId?: string | null;
}

export async function createExpectedPayment(input: CreateExpectedPaymentInput) {
  const payment = await prisma.payment.create({
    data: {
      customerId: input.customerId,
      contractId: input.contractId ?? null,
      method: input.method ?? "BANK_TRANSFER",
      state: "EXPECTED",
      expectedAmount: input.expectedAmount,
      actualAmount: 0,
      carryoverAmount: 0,
      dueDate: input.dueDate,
      notes: input.notes ?? input.source ?? null,
    },
  });
  await logAudit({
    actorType: input.actorUserId ? "USER" : "SYSTEM",
    actorId: input.actorUserId ?? null,
    action: "PAYMENT_CREATE",
    entityType: "Payment",
    entityId: payment.id,
    after: {
      state: "EXPECTED",
      expectedAmount: input.expectedAmount,
      dueDate: input.dueDate,
      source: input.source ?? null,
    },
  });
  return payment;
}

// ─────────────────────────────────────────────────────────────────────────
// Record cash collection from a visit (UC-VS-06 + UC-PY-01 hand-off)
// ─────────────────────────────────────────────────────────────────────────

export interface RecordCashCollectionInput {
  visitId: string;
  customerId: string;
  contractId?: string | null;
  collectedById: string;
  actualAmount: number;
  expectedAmount?: number;
  method?: PaymentMethod;
  notes?: string | null;
}

export async function recordCashCollection(
  input: RecordCashCollectionInput,
): Promise<{ paymentId: string; receiptQueued: number }> {
  const expected = input.expectedAmount ?? input.actualAmount;
  const carryover = Math.max(0, expected - input.actualAmount);

  const payment = await prisma.payment.create({
    data: {
      customerId: input.customerId,
      contractId: input.contractId ?? null,
      visitId: input.visitId,
      collectedById: input.collectedById,
      method: input.method ?? "CASH",
      state: "COLLECTED",
      expectedAmount: expected > 0 ? expected : input.actualAmount,
      actualAmount: input.actualAmount,
      carryoverAmount: carryover,
      collectedAt: new Date(),
      notes: input.notes ?? null,
    },
  });

  await logAudit({
    actorType: "USER",
    actorId: input.collectedById,
    action: "PAYMENT_COLLECT_CASH",
    entityType: "Payment",
    entityId: payment.id,
    after: {
      visitId: input.visitId,
      actualAmount: input.actualAmount,
      expectedAmount: expected,
      carryoverAmount: carryover,
      method: payment.method,
    },
  });

  const receiptQueued = await queueReceiptEmail({
    paymentId: payment.id,
    actorUserId: input.collectedById,
  });

  return { paymentId: payment.id, receiptQueued };
}

// ─────────────────────────────────────────────────────────────────────────
// Bank transfer reconciliation (UC-PY-02)
// ─────────────────────────────────────────────────────────────────────────

export interface RecordBankTransferInput {
  customerId: string;
  contractId?: string | null;
  expectedPaymentId?: string | null;
  actualAmount: number;
  reference: string;
  transferredAt: Date;
  notes?: string | null;
  actorUserId: string;
}

export async function recordBankTransfer(input: RecordBankTransferInput) {
  // If we're settling an existing EXPECTED row, transition it directly to
  // RECONCILED. Otherwise create a fresh RECONCILED row (e.g. unexpected
  // pre-payment).
  let payment;
  if (input.expectedPaymentId) {
    const existing = await prisma.payment.findUnique({
      where: { id: input.expectedPaymentId },
    });
    if (!existing) {
      throw new IllegalPaymentTransitionError(
        "EXPECTED" as PaymentState,
        "RECONCILED" as PaymentState,
      );
    }
    const plan = planPaymentTransition(
      existing.state as PaymentState,
      "RECONCILED",
    );
    payment = await updatePaymentWithStateGuard({
      paymentId: existing.id,
      expectedPriorState: existing.state as PaymentState,
      data: {
        ...plan,
        method: "BANK_TRANSFER",
        actualAmount: input.actualAmount,
        reference: input.reference,
        notes: input.notes ?? existing.notes ?? null,
      },
    });
  } else {
    payment = await prisma.payment.create({
      data: {
        customerId: input.customerId,
        contractId: input.contractId ?? null,
        method: "BANK_TRANSFER",
        state: "RECONCILED",
        expectedAmount: input.actualAmount,
        actualAmount: input.actualAmount,
        carryoverAmount: 0,
        reference: input.reference,
        collectedAt: input.transferredAt,
        reconciledAt: new Date(),
        notes: input.notes ?? null,
      },
    });
  }

  await logAudit({
    actorType: "USER",
    actorId: input.actorUserId,
    action: "PAYMENT_BANK_TRANSFER",
    entityType: "Payment",
    entityId: payment.id,
    after: {
      reference: input.reference,
      actualAmount: input.actualAmount,
      transferredAt: input.transferredAt,
    },
  });

  await queueReceiptEmail({
    paymentId: payment.id,
    actorUserId: input.actorUserId,
  });
  return payment;
}

// ─────────────────────────────────────────────────────────────────────────
// Hand over (technician → office)  (UC-PY-04)
// ─────────────────────────────────────────────────────────────────────────

export async function handOverCash(args: {
  paymentId: string;
  handedOverById: string;
}) {
  const current = await prisma.payment.findUnique({
    where: { id: args.paymentId },
  });
  if (!current) throw new Error("Payment not found");

  const plan = planPaymentTransition(
    current.state as PaymentState,
    "HANDED_OVER",
  );

  const updated = await updatePaymentWithStateGuard({
    paymentId: args.paymentId,
    expectedPriorState: current.state as PaymentState,
    data: plan,
  });

  await logAudit({
    actorType: "USER",
    actorId: args.handedOverById,
    action: "PAYMENT_HAND_OVER",
    entityType: "Payment",
    entityId: args.paymentId,
    before: { state: current.state },
    after: { state: updated.state, handedOverAt: updated.handedOverAt },
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────
// Reconcile (MANAGER+)  (UC-PY-05)
// ─────────────────────────────────────────────────────────────────────────

export async function reconcilePayment(args: {
  paymentId: string;
  reconciledById: string;
}) {
  const current = await prisma.payment.findUnique({
    where: { id: args.paymentId },
  });
  if (!current) throw new Error("Payment not found");

  const plan = planPaymentTransition(
    current.state as PaymentState,
    "RECONCILED",
  );
  const updated = await updatePaymentWithStateGuard({
    paymentId: args.paymentId,
    expectedPriorState: current.state as PaymentState,
    data: plan,
  });

  await logAudit({
    actorType: "USER",
    actorId: args.reconciledById,
    action: "PAYMENT_RECONCILE",
    entityType: "Payment",
    entityId: args.paymentId,
    before: { state: current.state },
    after: { state: updated.state, reconciledAt: updated.reconciledAt },
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────
// Partial payment (UC-PY-03)
// ─────────────────────────────────────────────────────────────────────────

export async function applyPartialPayment(args: {
  paymentId: string;
  partialAmount: number;
  actorUserId: string;
}): Promise<{ closed: { id: string }; carryover: { id: string } | null }> {
  const current = await prisma.payment.findUnique({
    where: { id: args.paymentId },
  });
  if (!current) throw new Error("Payment not found");

  const expected = toNumber(current.expectedAmount);
  if (args.partialAmount <= 0 || args.partialAmount > expected) {
    throw new Error("Invalid partial amount");
  }

  const remainder = expected - args.partialAmount;

  // Close the original with the reduced amount + RECONCILED (or COLLECTED for
  // mid-flow). We mark RECONCILED because the partial side has been settled
  // in some form (e.g. cash + bank, or two cheques).
  const closed = await updatePaymentWithStateGuard({
    paymentId: args.paymentId,
    expectedPriorState: current.state as PaymentState,
    data: {
      actualAmount: args.partialAmount,
      carryoverAmount: 0,
      state: "RECONCILED",
      reconciledAt: new Date(),
    },
  });

  let carryover: { id: string } | null = null;
  if (remainder > 0) {
    const carry = await prisma.payment.create({
      data: {
        customerId: current.customerId,
        contractId: current.contractId,
        method: current.method,
        state: "EXPECTED",
        expectedAmount: remainder,
        actualAmount: 0,
        carryoverAmount: remainder,
        dueDate: current.dueDate,
        notes: `Carryover from ${current.id}`,
      },
    });
    carryover = { id: carry.id };
  }

  await logAudit({
    actorType: "USER",
    actorId: args.actorUserId,
    action: "PAYMENT_PARTIAL",
    entityType: "Payment",
    entityId: args.paymentId,
    before: { state: current.state, expectedAmount: expected },
    after: {
      partialAmount: args.partialAmount,
      carryoverPaymentId: carryover?.id ?? null,
      remainder,
    },
  });

  return { closed: { id: closed.id }, carryover };
}

// ─────────────────────────────────────────────────────────────────────────
// Mark overdue (cron-only)
// ─────────────────────────────────────────────────────────────────────────

export async function markOverdue(args: {
  paymentId: string;
  stage: "OVERDUE_D7" | "OVERDUE_D14" | "OVERDUE_D30";
}) {
  const current = await prisma.payment.findUnique({
    where: { id: args.paymentId },
  });
  if (!current) throw new Error("Payment not found");

  const plan = planPaymentTransition(
    current.state as PaymentState,
    args.stage,
  );
  const updated = await updatePaymentWithStateGuard({
    paymentId: args.paymentId,
    expectedPriorState: current.state as PaymentState,
    data: plan,
  });

  await logAudit({
    actorType: "SYSTEM",
    action: "PAYMENT_OVERDUE",
    entityType: "Payment",
    entityId: args.paymentId,
    before: { state: current.state },
    after: { state: updated.state },
  });
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────
// Write off (MANAGER+)
// ─────────────────────────────────────────────────────────────────────────

export async function writeOff(args: {
  paymentId: string;
  reason: string;
  actorUserId: string;
}) {
  const current = await prisma.payment.findUnique({
    where: { id: args.paymentId },
  });
  if (!current) throw new Error("Payment not found");

  const plan = planPaymentTransition(
    current.state as PaymentState,
    "WRITTEN_OFF",
  );
  const updated = await updatePaymentWithStateGuard({
    paymentId: args.paymentId,
    expectedPriorState: current.state as PaymentState,
    data: { ...plan, notes: `${current.notes ?? ""}\nWrite-off: ${args.reason}`.trim() },
  });

  await logAudit({
    actorType: "USER",
    actorId: args.actorUserId,
    action: "PAYMENT_WRITE_OFF",
    entityType: "Payment",
    entityId: args.paymentId,
    before: { state: current.state },
    after: { state: updated.state, reason: args.reason },
  });
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────
// Days-overdue helper used by the UI + list endpoint
// ─────────────────────────────────────────────────────────────────────────

export function computeDaysOverdue(
  dueDate: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!dueDate) return 0;
  const ms = now.getTime() - new Date(dueDate).getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** Locale picker used by per-customer notifications. */
export function pickContactLocale(
  contacts: { language?: string | null; isPrimary?: boolean }[],
): NotificationLocale {
  const primary = contacts.find((c) => c.isPrimary);
  const lang = (primary ?? contacts[0])?.language;
  return (lang as NotificationLocale) ?? "vi";
}
