/**
 * POST /api/equipment/[id]/status — change status (deactivate / terminate / reactivate).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canManageEquipment } from "@/lib/customers/access";
import { equipmentStatusSchema } from "@/lib/validators/equipment";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { closePause, openPause } from "@/lib/contracts/pause-period";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["DEACTIVATED", "TERMINATED", "RELOCATED"],
  RELOCATED: ["ACTIVE", "DEACTIVATED", "TERMINATED"],
  DEACTIVATED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
  REPLACED: [],
};

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) throw new ForbiddenError("Cannot manage equipment");
    const { id } = await ctx.params;

    const before = await prisma.equipment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Equipment not found");

    const body = await request.json().catch(() => null);
    const parsed = equipmentStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid status payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { status, reason, effectiveAt: effectiveAtInput } = parsed.data;
    const allowed = ALLOWED_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(status)) {
      throw new ValidationError(`Cannot transition equipment from ${before.status} to ${status}`);
    }
    // Office staff can back-date the change (or leave it blank for "now").
    // We allow past dates because the device was usually deactivated /
    // terminated in the field a few days before the office logs it.
    // Future dates are still allowed (scheduled-out cases) but capped at
    // 1 year so a typo can't push the contract end-date a decade out.
    const now = new Date();
    const effectiveAt = effectiveAtInput ?? now;
    const oneYearOut = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    if (effectiveAt > oneYearOut) {
      throw new ValidationError("effectiveAt cannot be more than 1 year in the future");
    }

    // Per-equipment pause-ledger maintenance (2026-06 policy).
    //
    // DEACTIVATING this unit opens a pause window on every
    // ContractEquipment line that links to it AND belongs to an
    // ACTIVE/AMENDED RENTAL or MAINTENANCE contract — those are the
    // contracts that carry billing for this device. SALE contracts and
    // already-terminated contracts are skipped.
    //
    // REACTIVATING (status -> ACTIVE) closes the open pause window on
    // every such line, rolling the elapsed days into cumulativePausedDays.
    //
    // TERMINATING also closes any open window so the cumulative counter
    // doesn't keep ticking against an entry that will never be billed
    // again. We don't auto-set settledAt — the cron / explicit retrieval
    // flow does that.
    const pauseAffectedLines = await prisma.contractEquipment.findMany({
      where: {
        equipmentId: id,
        contract: {
          type: { in: ["RENTAL", "MAINTENANCE"] },
          state: { in: ["ACTIVE", "AMENDED"] },
        },
      },
      select: {
        id: true,
        cumulativePausedDays: true,
        currentPauseStartedAt: true,
      },
    });

    const updated = await prisma.$transaction(async (tx) => {
      // Equipment.deactivatedAt / terminatedAt record the office's stated
      // effective moment (which may be back-dated). Going back to ACTIVE
      // clears deactivatedAt.
      const lifecycleData: {
        status: typeof status;
        notes: string | null;
        deactivatedAt?: Date | null;
        terminatedAt?: Date | null;
      } = { status, notes: reason ?? before.notes };
      if (status === "DEACTIVATED") {
        lifecycleData.deactivatedAt = effectiveAt;
      } else if (status === "ACTIVE") {
        lifecycleData.deactivatedAt = null;
      } else if (status === "TERMINATED") {
        lifecycleData.terminatedAt = effectiveAt;
      }
      const eq = await tx.equipment.update({
        where: { id },
        data: lifecycleData,
      });

      if (status === "DEACTIVATED") {
        for (const line of pauseAffectedLines) {
          const ledger = openPause(
            {
              cumulativePausedDays: line.cumulativePausedDays,
              currentPauseStartedAt: line.currentPauseStartedAt,
            },
            effectiveAt,
          );
          if (ledger.currentPauseStartedAt !== line.currentPauseStartedAt) {
            await tx.contractEquipment.update({
              where: { id: line.id },
              data: { currentPauseStartedAt: ledger.currentPauseStartedAt },
            });
          }
        }
      } else if (status === "ACTIVE" || status === "TERMINATED") {
        for (const line of pauseAffectedLines) {
          if (!line.currentPauseStartedAt) continue;
          const ledger = closePause(
            {
              cumulativePausedDays: line.cumulativePausedDays,
              currentPauseStartedAt: line.currentPauseStartedAt,
            },
            effectiveAt,
          );
          await tx.contractEquipment.update({
            where: { id: line.id },
            data: {
              cumulativePausedDays: ledger.cumulativePausedDays,
              currentPauseStartedAt: ledger.currentPauseStartedAt,
              // TERMINATED also marks the line as settled at the effective
              // moment — billing has stopped and the contract's per-line
              // wrap-up is complete for this equipment.
              ...(status === "TERMINATED" ? { settledAt: effectiveAt } : {}),
            },
          });
        }
      }

      return eq;
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: `EQUIPMENT_STATUS_${status}`,
      entityType: "Equipment",
      entityId: id,
      before,
      after: {
        ...updated,
        reason,
        pauseLinesAffected: pauseAffectedLines.length,
      },
      request,
    });
    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
