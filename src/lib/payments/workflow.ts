/**
 * PaymentWorkflow — public façade for the Payment domain (Refactor C).
 *
 * Every route that mutates a Payment should import from here rather than
 * reaching directly into `operations.ts` / `state.ts` / `access.ts`. The
 * facade owns:
 *
 *   - state transitions (via `planPaymentTransition`)
 *   - access checks  (via `payments/access`)
 *   - audit          (via `lib/audit`)
 *   - notification dispatch (via `lib/notifications/send`)
 *   - concurrency guard (`src/lib/db/state-guard.ts`)
 *
 * Sibling files (`operations.ts`, `state.ts`, `access.ts`, `recurring.ts`) are
 * kept for their pure helpers and stay individually testable; their exports
 * remain backwards-compatible.
 */

import prisma from "@/lib/prisma";
import {
  applyPartialPayment,
  computeDaysOverdue,
  createExpectedPayment,
  handOverCash,
  markOverdue,
  pickContactLocale,
  reconcilePayment,
  recordBankTransfer,
  recordCashCollection,
  writeOff,
  type CreateExpectedPaymentInput,
  type RecordBankTransferInput,
  type RecordCashCollectionInput,
} from "@/lib/payments/operations";
export { IllegalPaymentTransitionError } from "@/lib/payments/state";
export type { PaymentState } from "@/lib/payments/state";
import {
  canApplyPartial,
  canCreateExpectedPayment,
  canHandOver,
  canIssueTaxInvoice,
  canReconcile,
  canRecordBankTransfer,
  canViewPaymentList,
  canWriteOff,
  isManagerOrHigher,
  isOfficeRole,
  paymentScopeForActor,
} from "@/lib/payments/access";

// ── Mutators ───────────────────────────────────────────────────────────────

async function createExpected(input: CreateExpectedPaymentInput) {
  return createExpectedPayment(input);
}

async function recordCash(input: RecordCashCollectionInput) {
  return recordCashCollection(input);
}

async function recordTransfer(input: RecordBankTransferInput) {
  return recordBankTransfer(input);
}

async function handOver(args: { paymentId: string; handedOverById: string }) {
  return handOverCash(args);
}

async function reconcile(args: { paymentId: string; reconciledById: string }) {
  return reconcilePayment(args);
}

async function applyPartial(args: {
  paymentId: string;
  partialAmount: number;
  actorUserId: string;
}) {
  return applyPartialPayment(args);
}

async function escalate(args: {
  paymentId: string;
  stage: "OVERDUE_D7" | "OVERDUE_D14" | "OVERDUE_D30";
}) {
  return markOverdue(args);
}

async function writeOffPayment(args: {
  paymentId: string;
  reason: string;
  actorUserId: string;
}) {
  return writeOff(args);
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getById(paymentId: string) {
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

async function list(filters: Parameters<typeof prisma.payment.findMany>[0] = {}) {
  return prisma.payment.findMany(filters);
}

async function outstandingForCustomer(customerId: string) {
  return prisma.payment.findMany({
    where: {
      customerId,
      state: {
        in: ["EXPECTED", "COLLECTED", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"],
      },
    },
    orderBy: { dueDate: "asc" },
  });
}

// ── Public façade ──────────────────────────────────────────────────────────

/** Role-check helpers re-exposed so routes only import the workflow. */
const access = {
  canApplyPartial,
  canCreateExpected: canCreateExpectedPayment,
  canHandOver,
  canIssueTaxInvoice,
  canReconcile,
  canRecordBankTransfer,
  canViewList: canViewPaymentList,
  canWriteOff,
  isManagerOrHigher,
  isOfficeRole,
  scopeForActor: paymentScopeForActor,
} as const;

export const PaymentWorkflow = {
  // mutators
  createExpected,
  recordCash,
  recordTransfer,
  handOver,
  reconcile,
  applyPartial,
  escalate,
  writeOff: writeOffPayment,
  // queries
  getById,
  list,
  outstandingForCustomer,
  // pure utilities re-exported for caller ergonomics
  computeDaysOverdue,
  pickContactLocale,
  access,
} as const;

export type PaymentWorkflowType = typeof PaymentWorkflow;
