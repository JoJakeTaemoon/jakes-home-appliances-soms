/**
 * Contract renewal helper (UC-CT-06).
 *
 * Pre-fills a new DRAFT contract from a parent (typically RENTAL → MAINTENANCE
 * or RENTAL → RENTAL). The new row's equipment is cloned, fee adjustment is
 * applied, and a fresh contract code is allocated. Caller decides when to
 * transition it to ACTIVE (and to mark the parent COMPLETED).
 *
 * This is NOT the same as an Appendix (`amend.ts`) — renewal yields a fully
 * independent contract row with no `parentContractId`. Per SPEC §5.1 the
 * intended use is end-of-rental-term: original `state='COMPLETED'`, new
 * contract `state='ACTIVE'` after office activation.
 */

import prisma from "@/lib/prisma";
import { allocateContractCode } from "@/lib/contracts/code";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import type { ContractType } from "@/generated/prisma/client";

export interface RenewalAdjustments {
  /** Replaces monthlyMaintenanceFee; null inherits parent. */
  monthlyMaintenanceFee?: number | null;
  /** Replaces term; defaults to 12 if parent was a rental converting to maintenance. */
  termMonths?: number | null;
  /** Override new contract type — default: inherit parent type. */
  type?: ContractType;
  /** Override start date — default: today. */
  startDate?: Date | null;
  signedAt?: Date;
}

export async function prepareRenewal(
  parentContractId: string,
  adjustments: RenewalAdjustments = {},
) {
  const parent = await prisma.contract.findUnique({
    where: { id: parentContractId },
    include: {
      equipment: true,
      customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
    },
  });
  if (!parent) throw new NotFoundError("Parent contract not found");
  if (!parent.equipment || parent.equipment.length === 0) {
    throw new ValidationError("Cannot renew a contract that has no equipment lines");
  }

  const customer = parent.customer;
  const signedAt = adjustments.signedAt ?? new Date();
  const baseCode = allocateContractCode({
    customer: { type: customer.type, code: customer.code, shortcode: customer.shortcode },
    type: adjustments.type ?? parent.type,
    signedAt,
  });
  // If a contract was already issued for this customer + date (e.g. an
  // amendment or another renewal earlier today), append a `-R<n>` suffix so
  // we don't collide on the unique contractNumber index.
  let newCode = baseCode;
  let renewalSuffix = 0;

  while (true) {
    const collision = await prisma.contract.findUnique({
      where: { contractNumber: newCode },
      select: { id: true },
    });
    if (!collision) break;
    renewalSuffix += 1;
    newCode = `${baseCode}-R${renewalSuffix}`;
  }

  const newType: ContractType = adjustments.type ?? parent.type;
  const newTerm =
    adjustments.termMonths ??
    (parent.type === "RENTAL" && newType === "MAINTENANCE" ? 12 : parent.termMonths);
  const start = adjustments.startDate ?? signedAt;
  const end = newTerm ? new Date(start.getTime() + newTerm * 30 * 24 * 60 * 60 * 1000) : null;

  const created = await prisma.contract.create({
    data: {
      contractNumber: newCode,
      customerId: customer.id,
      type: newType,
      state: "DRAFT",
      startDate: start,
      endDate: end,
      termMonths: newTerm ?? null,
      monthlyMaintenanceFee:
        adjustments.monthlyMaintenanceFee !== undefined &&
        adjustments.monthlyMaintenanceFee !== null
          ? adjustments.monthlyMaintenanceFee
          : parent.monthlyMaintenanceFee,
      equipment: {
        create: parent.equipment.map((e) => ({
          equipmentId: e.equipmentId,
          unitPrice: e.unitPrice ?? undefined,
          quantity: e.quantity,
          notes: e.notes ?? undefined,
        })),
      },
    },
    include: {
      equipment: { include: { equipment: { include: { model: true } } } },
      customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
    },
  });

  return { contract: created, parent: { id: parent.id, contractNumber: parent.contractNumber } };
}
