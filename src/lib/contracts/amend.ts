/**
 * Contract amendment helper (UC-CT-05 + UC-CT-09).
 *
 * B2B amendments → new Contract row with `parentContractId`, `amendmentRevision = parent + 1`.
 * B2C amendments → in-place update of `monthlyMaintenanceFee` + AuditLog
 * (the parent contract stays the source of truth).
 *
 * Both paths emit a fresh PDF via the render service (caller invokes that
 * after this function returns — kept separate so the function is testable
 * without a working PDF pipeline).
 */

import prisma from "@/lib/prisma";
import { allocateContractCode } from "@/lib/contracts/code";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export type AmendmentChangeType =
  | "ADD_EQUIPMENT"
  | "REMOVE_EQUIPMENT"
  | "FEE_ADJUST"
  | "SCOPE_CHANGE";

export interface AmendmentEquipmentLine {
  /** Amendment paths only support attaching existing Equipment rows
   *  for now — materialise-mode (modelId + serial sweep) is the
   *  contract-create flow's job. The validator's `modelId` field is
   *  ignored here; passing it on this path raises ValidationError. */
  equipmentId?: string | null;
  modelId?: string | null;
  unitPrice?: number | null;
  quantity?: number;
  notes?: string | null;
}

export interface AmendmentInput {
  changeType: AmendmentChangeType;
  equipment?: AmendmentEquipmentLine[];
  /** Replace fee. For B2C in-place; for B2B used on new row. */
  monthlyMaintenanceFee?: number | null;
  /** Free-text description of the change. */
  reason: string;
}

export interface AmendmentResult {
  /** The contract that should be presented to the user — for B2B this is the new revision; for B2C this is the (in-place) updated parent. */
  contract: Prisma.ContractGetPayload<{
    include: {
      equipment: { include: { equipment: { include: { model: true } } } };
      customer: { select: { id: true; code: true; name: true; type: true; shortcode: true } };
    };
  }>;
  /** True iff a new Contract row was created (B2B path); false for B2C in-place. */
  isNewRevision: boolean;
  before?: unknown;
  after?: unknown;
}

/**
 * Create or in-place amend.
 *
 * Caller is expected to wrap this in their handler and:
 *   - check role (MANAGER+ via `canAmendContract`)
 *   - write the AuditLog (action = "CONTRACT_AMENDED", before/after present in result)
 *   - render the PDF afterwards
 */
export async function createAmendment(
  parentContractId: string,
  input: AmendmentInput,
): Promise<AmendmentResult> {
  const parent = await prisma.contract.findUnique({
    where: { id: parentContractId },
    include: {
      equipment: { include: { equipment: { include: { model: true } } } },
      customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
    },
  });
  if (!parent) throw new NotFoundError("Parent contract not found");
  if (parent.state !== "ACTIVE") {
    throw new ValidationError("Only ACTIVE contracts can be amended");
  }

  const customer = parent.customer;
  const isB2B = customer.type === "B2B";

  if (isB2B) {
    // Create a fresh revision row that inherits term + customer + (possibly modified) equipment.
    const baseEquipment = input.equipment && input.equipment.length > 0
      ? input.equipment
      : parent.equipment.map((e) => ({
          equipmentId: e.equipmentId,
          unitPrice: e.unitPrice ? Number(e.unitPrice) : null,
          quantity: e.quantity,
          notes: e.notes,
        }));

    if (baseEquipment.length === 0) {
      throw new ValidationError("Amendment requires at least one equipment line");
    }

    // Amendment paths only attach existing Equipment. The contract-create
    // validator allows `modelId` materialise-mode; reject that here so a
    // mistakenly-routed payload doesn't silently slip through.
    for (const [i, line] of baseEquipment.entries()) {
      const modelId = "modelId" in line ? line.modelId : null;
      if (modelId) {
        throw new ValidationError(
          `equipment[${i}] — modelId not allowed on amendment; use the contract install flow instead`,
        );
      }
      if (!line.equipmentId) {
        throw new ValidationError(`equipment[${i}].equipmentId — required`);
      }
    }
    // Validate all referenced equipment belong to the customer (and same site rule defer to caller).
    const equipmentIds = baseEquipment.map((l) => l.equipmentId!);
    const owned = await prisma.equipment.findMany({
      where: { id: { in: equipmentIds }, customerId: customer.id },
      select: { id: true },
    });
    if (owned.length !== equipmentIds.length) {
      throw new ValidationError("One or more equipment items do not belong to this customer");
    }

    const newCode = allocateContractCode({
      customer: { type: "B2B", code: customer.code, shortcode: customer.shortcode },
      parent: { contractNumber: parent.contractNumber, amendmentRevision: parent.amendmentRevision },
    });

    const newContract = await prisma.contract.create({
      data: {
        contractNumber: newCode,
        customerId: customer.id,
        type: parent.type,
        state: "ACTIVE",
        startDate: parent.startDate,
        endDate: parent.endDate,
        termMonths: parent.termMonths,
        monthlyMaintenanceFee:
          input.monthlyMaintenanceFee !== undefined && input.monthlyMaintenanceFee !== null
            ? input.monthlyMaintenanceFee
            : parent.monthlyMaintenanceFee,
        parentContractId: parent.id,
        amendmentRevision: parent.amendmentRevision + 1,
        amendmentReason: input.reason,
        signedByCompanyAt: new Date(),
        signedByCustomerAt: new Date(),
        activatedAt: new Date(),
        equipment: {
          create: baseEquipment.map((l) => ({
            equipmentId: l.equipmentId!,
            unitPrice: l.unitPrice ?? undefined,
            quantity: l.quantity ?? 1,
            notes: l.notes ?? undefined,
          })),
        },
      },
      include: {
        equipment: { include: { equipment: { include: { model: true } } } },
        customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
      },
    });

    return {
      contract: newContract,
      isNewRevision: true,
      before: {
        amendmentRevision: parent.amendmentRevision,
        monthlyMaintenanceFee: parent.monthlyMaintenanceFee,
      },
      after: {
        amendmentRevision: newContract.amendmentRevision,
        monthlyMaintenanceFee: newContract.monthlyMaintenanceFee,
        contractNumber: newContract.contractNumber,
      },
    };
  }

  // B2C in-place fee update path.
  if (input.changeType !== "FEE_ADJUST") {
    throw new ValidationError("B2C contracts only support FEE_ADJUST amendments");
  }
  if (input.monthlyMaintenanceFee === undefined || input.monthlyMaintenanceFee === null) {
    throw new ValidationError("FEE_ADJUST requires monthlyMaintenanceFee");
  }

  const before = {
    monthlyMaintenanceFee: parent.monthlyMaintenanceFee,
    amendmentReason: parent.amendmentReason,
  };

  const updated = await prisma.contract.update({
    where: { id: parent.id },
    data: {
      monthlyMaintenanceFee: input.monthlyMaintenanceFee,
      amendmentReason: input.reason,
    },
    include: {
      equipment: { include: { equipment: { include: { model: true } } } },
      customer: { select: { id: true, code: true, name: true, type: true, shortcode: true } },
    },
  });

  return {
    contract: updated,
    isNewRevision: false,
    before,
    after: {
      monthlyMaintenanceFee: updated.monthlyMaintenanceFee,
      amendmentReason: updated.amendmentReason,
    },
  };
}
