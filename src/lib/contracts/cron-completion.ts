/**
 * Rental completion cron (UC-EQ-07 / B.3 confirmed).
 *
 *   RENTAL contracts where:
 *     - state ∈ { ACTIVE, AMENDED }
 *     - contract.endDate < now (initial cheap filter)
 *
 *   For each ContractEquipment line under such a contract:
 *     - Skip if it already has settledAt set.
 *     - Compute the line's per-equipment effective end date
 *       (contract.endDate + cumulativePausedDays + any in-flight pause).
 *     - Skip if effectiveEndDate > now (line still in pause-extended period).
 *     - If endOfTermAction = TRANSFER_OWNERSHIP: flip the underlying
 *       Equipment.ownership to CUSTOMER and mark the line's settledAt.
 *     - If endOfTermAction = RETRIEVE_DEVICE: spawn a SUGGESTED
 *       RETRIEVAL visit bound to this specific equipment and mark the
 *       line's settledAt.
 *
 *   When ALL lines under a contract have settledAt set, the contract
 *   transitions to COMPLETED and the rental-completed notification is
 *   queued. Mixed-state contracts (some settled, some still pending)
 *   stay ACTIVE/AMENDED.
 *
 * This implementation honours the 2026-06 policy: the Contract document
 * (endDate, totalContractValue, monthly fee) is IMMUTABLE. All
 * per-equipment delays are tracked on ContractEquipment.
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import type { NotificationLocale } from "@/lib/notifications/types";
import { effectiveEndDate } from "@/lib/contracts/pause-period";

export interface RentalCompletionSummary {
  contractsScanned: number;
  contractsCompleted: number;
  equipmentTransferred: number;
  retrievalVisitsCreated: number;
  notificationsQueued: number;
  skipped: { contractId: string; reason: string }[];
}

export async function runRentalCompletionCheck(
  now: Date = new Date(),
): Promise<RentalCompletionSummary> {
  const summary: RentalCompletionSummary = {
    contractsScanned: 0,
    contractsCompleted: 0,
    equipmentTransferred: 0,
    retrievalVisitsCreated: 0,
    notificationsQueued: 0,
    skipped: [],
  };

  const candidates = await prisma.contract.findMany({
    where: {
      type: "RENTAL",
      state: { in: ["ACTIVE", "AMENDED"] },
      endDate: { lt: now },
    },
    include: {
      equipment: {
        include: {
          equipment: {
            select: { id: true, status: true, ownership: true },
          },
        },
      },
      payments: { select: { id: true, state: true } },
      visits: {
        // De-dup guard: don't re-spawn a RETRIEVAL visit on subsequent
        // cron runs for an equipment line that already has one.
        where: { type: "RETRIEVAL" },
        select: { id: true, equipmentId: true, state: true },
      },
      customer: {
        select: {
          id: true,
          code: true,
          name: true,
          contacts: {
            where: { role: "CONTRACT_PARTY" },
            select: { id: true, language: true, email: true, phone1: true },
            take: 1,
          },
        },
      },
    },
  });
  summary.contractsScanned = candidates.length;

  for (const c of candidates) {
    // Payment gate: all outstanding rows must be settled / written-off
    // before we hand a device over (whether by transfer or retrieval).
    const hasUnsettled = c.payments.some((p) =>
      ["EXPECTED", "COLLECTED", "HANDED_OVER", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"].includes(p.state),
    );
    if (hasUnsettled) {
      summary.skipped.push({ contractId: c.id, reason: "Unsettled payments" });
      continue;
    }

    if (c.equipment.length === 0) {
      summary.skipped.push({ contractId: c.id, reason: "No equipment lines" });
      continue;
    }

    const visitsByEquipmentId = new Map<string, (typeof c.visits)[number]>();
    for (const v of c.visits) {
      if (v.equipmentId) visitsByEquipmentId.set(v.equipmentId, v);
    }

    let flippedThisContract = 0;
    let retrievalsThisContract = 0;
    let newlySettledThisContract = 0;

    for (const ce of c.equipment) {
      if (ce.settledAt) continue;
      const eff = effectiveEndDate(
        c.endDate,
        {
          cumulativePausedDays: ce.cumulativePausedDays,
          currentPauseStartedAt: ce.currentPauseStartedAt,
        },
        now,
      );
      if (!eff || eff > now) continue; // pause-extended; settle later

      if (c.endOfTermAction === "RETRIEVE_DEVICE") {
        // One retrieval visit per equipment line. Idempotent guard:
        // skip if there's already a RETRIEVAL visit on this contract for
        // this exact equipment id.
        if (visitsByEquipmentId.has(ce.equipmentId)) {
          // Still mark settled — the previous retrieval visit covers it.
          await prisma.contractEquipment.update({
            where: { id: ce.id },
            data: { settledAt: now },
          });
          newlySettledThisContract++;
          continue;
        }
        await prisma.$transaction(async (tx) => {
          await tx.visit.create({
            data: {
              customerId: c.customerId,
              contractId: c.id,
              equipmentId: ce.equipmentId,
              type: "RETRIEVAL",
              state: "SUGGESTED",
              scheduledFor: now,
            },
          });
          await tx.contractEquipment.update({
            where: { id: ce.id },
            data: { settledAt: now },
          });
          await tx.auditLog.create({
            data: {
              actorType: "SYSTEM",
              action: "CONTRACT_RETRIEVAL_VISIT_AUTO",
              entityType: "ContractEquipment",
              entityId: ce.id,
              after: {
                contractNumber: c.contractNumber,
                equipmentId: ce.equipmentId,
                pausedDaysApplied: ce.cumulativePausedDays,
              },
            },
          });
        });
        retrievalsThisContract++;
        newlySettledThisContract++;
        continue;
      }

      // TRANSFER_OWNERSHIP: flip ownership of THIS equipment only.
      if (
        ce.equipment.status === "ACTIVE" &&
        ce.equipment.ownership === "COMPANY"
      ) {
        await prisma.$transaction(async (tx) => {
          await tx.equipment.update({
            where: { id: ce.equipment.id },
            data: { ownership: "CUSTOMER" },
          });
          await tx.contractEquipment.update({
            where: { id: ce.id },
            data: { settledAt: now },
          });
        });
        flippedThisContract++;
        newlySettledThisContract++;
      } else {
        // Equipment isn't ACTIVE/COMPANY — record settle anyway so the
        // contract can wrap.
        await prisma.contractEquipment.update({
          where: { id: ce.id },
          data: { settledAt: now },
        });
        newlySettledThisContract++;
      }
    }

    summary.equipmentTransferred += flippedThisContract;
    summary.retrievalVisitsCreated += retrievalsThisContract;

    // Re-read settledAt to decide whether the contract is done.
    const allLines = await prisma.contractEquipment.findMany({
      where: { contractId: c.id },
      select: { settledAt: true },
    });
    const allSettled = allLines.every((l) => l.settledAt !== null);

    if (allSettled) {
      await prisma.$transaction(async (tx) => {
        await tx.contract.update({
          where: { id: c.id },
          data: { state: "COMPLETED" },
        });
        await tx.auditLog.create({
          data: {
            actorType: "SYSTEM",
            action: "CONTRACT_COMPLETED_AUTO",
            entityType: "Contract",
            entityId: c.id,
            after: {
              contractNumber: c.contractNumber,
              equipmentFlipped: flippedThisContract,
              retrievalsCreated: retrievalsThisContract,
            },
          },
        });
      });

      const contact = c.customer.contacts[0];
      if (contact) {
        try {
          await sendNotification({
            templateCode: "EMAIL_RENTAL_COMPLETED",
            customerContactId: contact.id,
            locale: (contact.language ?? "vi") as NotificationLocale,
            vars: {
              name: c.customer.name,
              contract_no: c.contractNumber,
              completed_at: now.toISOString().slice(0, 10),
              equipment_count: String(flippedThisContract),
              url: "https://portal.seoulaqua.com.vn",
              hq_phone: "028-1234-5678",
            },
            actorType: "SYSTEM",
          });
          summary.notificationsQueued++;
        } catch (err) {
          console.error(
            `[cron-completion] Failed to send EMAIL_RENTAL_COMPLETED for ${c.id}: ${err}`,
          );
        }
      }

      summary.contractsCompleted++;
    } else if (newlySettledThisContract === 0) {
      summary.skipped.push({
        contractId: c.id,
        reason: "All remaining lines still within pause-extended period",
      });
    }
  }

  return summary;
}
