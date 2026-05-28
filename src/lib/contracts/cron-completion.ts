/**
 * Rental completion cron (UC-EQ-07 / B.3 confirmed).
 *
 *   RENTAL contracts where:
 *     - state = ACTIVE
 *     - endDate < now()
 *     - all Payments are RECONCILED (or there are no Payment rows yet)
 *
 *   → transition contract state to COMPLETED
 *   → flip every Equipment in the contract from ownership=COMPANY to ownership=CUSTOMER
 *     (only those still ACTIVE; equipment in REPLACED/TERMINATED stays as-is)
 *   → dispatch EMAIL_RENTAL_COMPLETED via the notification factory
 *
 * Phase 6 will schedule this via Vercel Cron; for now expose it as a manual
 * trigger usable via `npx tsx scripts/cron-rental-completion.ts`.
 *
 * Phase 3.5 update: notification dispatch moved off the inline
 * NotificationLog write and onto `sendNotification()` — the mock provider
 * still writes a status=MOCKED row, but production will swap to Resend via
 * EMAIL_PROVIDER env without touching this file.
 */

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import type { NotificationLocale } from "@/lib/notifications/types";

export interface RentalCompletionSummary {
  contractsScanned: number;
  contractsCompleted: number;
  equipmentTransferred: number;
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
    notificationsQueued: 0,
    skipped: [],
  };

  const candidates = await prisma.contract.findMany({
    where: {
      type: "RENTAL",
      state: "ACTIVE",
      endDate: { lt: now },
    },
    include: {
      equipment: { include: { equipment: { select: { id: true, status: true, ownership: true } } } },
      payments: { select: { id: true, state: true } },
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
    // All payments must be in a settled state. Treat absence-of-payments as OK
    // (in v1 payment rows are not always created up front).
    const hasUnsettled = c.payments.some((p) =>
      ["EXPECTED", "COLLECTED", "HANDED_OVER", "OVERDUE_D7", "OVERDUE_D14", "OVERDUE_D30"].includes(p.state),
    );
    if (hasUnsettled) {
      summary.skipped.push({ contractId: c.id, reason: "Unsettled payments" });
      continue;
    }

    let flipped = 0;
    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: c.id },
        data: { state: "COMPLETED" },
      });

      for (const ce of c.equipment) {
        if (ce.equipment.status === "ACTIVE" && ce.equipment.ownership === "COMPANY") {
          await tx.equipment.update({
            where: { id: ce.equipment.id },
            data: { ownership: "CUSTOMER" },
          });
          flipped++;
        }
      }
      summary.equipmentTransferred += flipped;

      await tx.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: "CONTRACT_COMPLETED_AUTO",
          entityType: "Contract",
          entityId: c.id,
          after: {
            contractNumber: c.contractNumber,
            equipmentFlipped: flipped,
          },
        },
      });
    });

    // Dispatch notification outside the transaction so a provider blip can't
    // roll back the contract state change. The notification log row is its
    // own forensic record.
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
            equipment_count: String(flipped),
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
  }

  return summary;
}
