/**
 * POST /api/contracts/[id]/terminate
 *
 * Mid-term contract cancellation. Replaces the old "state machine
 * transition to TERMINATED" with a richer flow that captures the refund
 * decision + device retrieval requirement in a single audit-able action.
 *
 * For RENTAL contracts the office often wants to:
 *   - record a partial deposit refund (DEPOSIT_REFUND payment row)
 *   - dispatch a RETRIEVAL visit (auto-suggested when the contract was
 *     created with endOfTermAction=RETRIEVE_DEVICE — office can still
 *     override either way)
 *
 * MANAGER+ only.
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
import { contractTerminateSchema } from "@/lib/validators/contract";
import { logAudit } from "@/lib/audit";

const paramsSchema = z.object({ id: z.string() });

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewContract(auth.role))
      throw new ForbiddenError("Cannot view contracts");
    if (!canAmendContract(auth.role))
      throw new ForbiddenError("MANAGER+ required to terminate contracts");
  },
  params: paramsSchema,
  body: contractTerminateSchema,
  handler: async ({ auth, body, params, request }) => {
    const before = await prisma.contract.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        contractNumber: true,
        type: true,
        state: true,
        customerId: true,
        deposit: true,
        endOfTermAction: true,
      },
    });
    if (!before) throw new NotFoundError("Contract not found");
    if (before.state !== "ACTIVE") {
      throw new ValidationError(
        "Only ACTIVE contracts can be terminated mid-term",
      );
    }

    const now = new Date();
    const refundAmount = body.refundAmount ?? 0;
    // Default the requireRetrieval flag to whatever the contract was set up
    // with (endOfTermAction=RETRIEVE_DEVICE) when the caller didn't pass an
    // explicit value. The modal in the UI pre-checks the box in that case.
    const requireRetrieval =
      body.requireRetrieval ?? before.endOfTermAction === "RETRIEVE_DEVICE";

    const updated = await prisma.$transaction(async (tx) => {
      const contract = await tx.contract.update({
        where: { id: before.id },
        data: {
          state: "TERMINATED",
          terminatedAt: now,
          terminationReason: body.reason,
          terminationRefundAmount: refundAmount > 0 ? refundAmount : null,
        },
      });

      if (refundAmount > 0) {
        await tx.payment.create({
          data: {
            customerId: contract.customerId,
            contractId: contract.id,
            kind: "DEPOSIT_REFUND",
            method: "BANK_TRANSFER",
            state: "EXPECTED",
            expectedAmount: refundAmount,
            actualAmount: 0,
            notes: `Refund on mid-term termination: ${body.reason}`,
          },
        });
      }

      if (requireRetrieval) {
        // Skip dedup logic — termination is itself an explicit operator
        // action; if a retrieval already exists the office can clean up
        // by cancelling it. Adding another row would be misleading.
        const existing = await tx.visit.findFirst({
          where: { contractId: contract.id, type: "RETRIEVAL" },
          select: { id: true },
        });
        if (!existing) {
          await tx.visit.create({
            data: {
              customerId: contract.customerId,
              contractId: contract.id,
              type: "RETRIEVAL",
              state: "SUGGESTED",
              scheduledFor: now,
            },
          });
        }
      }

      return contract;
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_TERMINATE",
      entityType: "Contract",
      entityId: updated.id,
      before: {
        state: before.state,
        type: before.type,
        deposit: before.deposit?.toString() ?? null,
        endOfTermAction: before.endOfTermAction,
      },
      after: {
        state: updated.state,
        terminationReason: body.reason,
        refundAmount: refundAmount || null,
        requireRetrieval,
      },
      request: request ?? null,
    });

    return updated;
  },
});
