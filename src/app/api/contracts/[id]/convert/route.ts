/**
 * POST /api/contracts/[id]/convert
 *
 * Mid-term RENTAL → SALE in-place conversion (decided 2026-06).
 *
 * The contract row keeps its id. `type` flips to SALE,
 * `totalContractValue` replaces the rental fee, RENTAL-only columns
 * (deposit, endOfTermAction, monthlyMaintenanceFee, termMonths, endDate)
 * get nulled, and the conversion lineage is captured in
 * `convertedFromType` + `convertedAt`. Equipment ownership flips to
 * CUSTOMER for every line. If `refundDeposit` is true a
 * DEPOSIT_REFUND payment row is generated for the office to settle.
 *
 * MANAGER+ only — converting a customer's contract is a price-change
 * action and shouldn't be done casually.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import {
  canViewContract,
  canAmendContract,
} from "@/lib/contracts/access";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { contractConvertSchema } from "@/lib/validators/contract";
import { logAudit } from "@/lib/audit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewContract(auth.role))
      throw new ForbiddenError("Cannot view contracts");
    if (!canAmendContract(auth.role))
      throw new ForbiddenError("MANAGER+ required to convert contracts");
  },
  params: paramsSchema,
  body: contractConvertSchema,
  handler: async ({ auth, body, params, request }) => {
    const before = await prisma.contract.findUnique({
      where: { id: params.id },
      include: {
        equipment: { select: { equipmentId: true } },
      },
    });
    if (!before) throw new NotFoundError("Contract not found");
    if (before.type !== "RENTAL") {
      throw new ValidationError(
        "Only RENTAL contracts can be converted to SALE",
      );
    }
    if (before.state !== "ACTIVE") {
      throw new ValidationError(
        "Only ACTIVE contracts can be converted",
      );
    }
    if (body.refundDeposit && (body.refundAmount ?? 0) <= 0) {
      throw new ValidationError(
        "refundAmount must be > 0 when refundDeposit is true",
      );
    }

    const now = new Date();
    const equipmentIds = before.equipment.map((e) => e.equipmentId);

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Flip contract to SALE in place. Null the RENTAL-only fields.
      const contract = await tx.contract.update({
        where: { id: before.id },
        data: {
          type: "SALE",
          totalContractValue: body.salePrice,
          monthlyMaintenanceFee: null,
          termMonths: null,
          endDate: null,
          endOfTermAction: null,
          deposit: null,
          convertedFromType: "RENTAL",
          convertedAt: now,
        },
      });

      // 2. Flip equipment ownership.
      if (equipmentIds.length > 0) {
        await tx.equipment.updateMany({
          where: { id: { in: equipmentIds } },
          data: { ownership: "CUSTOMER" },
        });
      }

      // 3. Optional deposit refund — recorded as an EXPECTED Payment for
      //    the office to mark COLLECTED once funds are actually returned.
      if (body.refundDeposit && body.refundAmount && body.refundAmount > 0) {
        await tx.payment.create({
          data: {
            customerId: contract.customerId,
            contractId: contract.id,
            kind: "DEPOSIT_REFUND",
            method: "BANK_TRANSFER",
            state: "EXPECTED",
            expectedAmount: body.refundAmount,
            actualAmount: 0,
            notes: `Deposit refund on RENTAL→SALE conversion: ${body.reason}`,
          },
        });
      }

      return contract;
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_CONVERT",
      entityType: "Contract",
      entityId: updated.id,
      before: {
        type: before.type,
        state: before.state,
        deposit: before.deposit?.toString() ?? null,
        endOfTermAction: before.endOfTermAction,
        monthlyMaintenanceFee: before.monthlyMaintenanceFee?.toString() ?? null,
        termMonths: before.termMonths,
        endDate: before.endDate?.toISOString() ?? null,
      },
      after: {
        type: updated.type,
        totalContractValue: updated.totalContractValue?.toString() ?? null,
        convertedFromType: updated.convertedFromType,
        convertedAt: updated.convertedAt?.toISOString() ?? null,
        refundDeposit: body.refundDeposit,
        refundAmount: body.refundAmount ?? null,
        reason: body.reason,
      },
      request: request ?? null,
    });

    return updated;
  },
});
