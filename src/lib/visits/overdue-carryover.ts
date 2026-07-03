/**
 * Overdue-carryover — when a new visit is created for a customer that
 * still has past-due Payments, auto-attach the "same-kind" receipt to
 * the visit's `pendingDocumentKinds` so the technician arrives with the
 * paperwork ready to collect the outstanding balance (2026-07-03 spec).
 *
 * "Same kind" is resolved from the customer's most recent receipt-family
 * Document (DELIVERY_RECEIPT / SALE_RECEIPT_B2C / DELIVERY_SLIP_B2B /
 * legacy RECEIPT) — that way the tech carries the same-shape document
 * the customer already saw last time. When no prior doc exists the
 * customer type picks the default (B2B → DELIVERY_SLIP_B2B, B2C →
 * SALE_RECEIPT_B2C).
 *
 * The resolver is split from the workflow write so it stays trivially
 * unit-testable — pass a `MinimalPrismaLike` (findFirst + count are
 * enough) and it returns the kind to append (or null when there's
 * nothing overdue).
 */

import type { DocumentKind } from "@/generated/prisma/client";

export const OVERDUE_STATES = [
  "OVERDUE_D7",
  "OVERDUE_D14",
  "OVERDUE_D30",
] as const;

/** Receipt-family kinds that a technician might carry to a customer. */
export const RECEIPT_FAMILY_KINDS = [
  "DELIVERY_RECEIPT",
  "SALE_RECEIPT_B2C",
  "DELIVERY_SLIP_B2B",
  "RECEIPT",
] as const satisfies ReadonlyArray<DocumentKind>;

export type ReceiptFamilyKind = (typeof RECEIPT_FAMILY_KINDS)[number];

export function defaultReceiptKindForCustomerType(
  type: "B2C" | "B2B",
): ReceiptFamilyKind {
  return type === "B2B" ? "DELIVERY_SLIP_B2B" : "SALE_RECEIPT_B2C";
}

// Loose shape so PrismaClient satisfies it in prod and a hand-rolled mock
// satisfies it in tests. Prisma's real signature is enum-typed and would
// refuse the readonly literal arrays we build below, so the arg type is
// `any` at the boundary — the resolver's body owns the actual query
// shape; anything the interface says here is documentation only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArg = any;
export interface OverdueCarryoverDeps {
  payment: { count: (args: AnyArg) => PromiseLike<number> };
  document: {
    findFirst: (args: AnyArg) => PromiseLike<{ kind: DocumentKind } | null>;
  };
}

/**
 * @returns the DocumentKind to append to the visit's pendingDocumentKinds,
 *          or `null` when the customer has no overdue balance (in which
 *          case the caller should leave pendingDocumentKinds untouched).
 */
export async function resolveOverdueCarryoverKind(
  db: OverdueCarryoverDeps,
  input: {
    customerId: string;
    customerType: "B2C" | "B2B";
    /** New visit's id — excluded from the prior-doc lookup so a
     *  same-transaction race doesn't pick up its own kind. */
    excludeVisitId?: string;
  },
): Promise<ReceiptFamilyKind | null> {
  const overdueCount = await db.payment.count({
    where: {
      customerId: input.customerId,
      state: { in: OVERDUE_STATES },
    },
  });
  if (overdueCount === 0) return null;

  const prior = await db.document.findFirst({
    where: {
      customerId: input.customerId,
      kind: { in: RECEIPT_FAMILY_KINDS },
      visitId: { not: null },
      ...(input.excludeVisitId ? { NOT: { visitId: input.excludeVisitId } } : {}),
    },
    orderBy: { generatedAt: "desc" },
    select: { kind: true },
  });

  if (prior && isReceiptFamily(prior.kind)) return prior.kind;
  return defaultReceiptKindForCustomerType(input.customerType);
}

function isReceiptFamily(k: DocumentKind): k is ReceiptFamilyKind {
  return (RECEIPT_FAMILY_KINDS as ReadonlyArray<DocumentKind>).includes(k);
}
