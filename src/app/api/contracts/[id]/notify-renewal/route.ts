/**
 * POST /api/contracts/[id]/notify-renewal
 *
 * Office-initiated SMS reminder to the CONTRACT_PARTY contact for a
 * RENTAL contract approaching its end date. We deliberately do NOT
 * auto-send these — the office staff clicks the [고객에게 만기 SMS 발송]
 * button on the contract detail page, the system dispatches once, and the
 * NotificationLog row + audit entry capture the deliberate action.
 *
 * Requires MANAGER+ to prevent staff from accidentally bulk-spamming
 * customers from the list view.
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
import { sendNotification } from "@/lib/notifications/send";
import { logAudit } from "@/lib/audit";
import type { NotificationLocale } from "@/lib/notifications/types";

const paramsSchema = z.object({ id: z.string() });
// Empty body — the action is implicit. We accept (and ignore) any body
// so existing fetch helpers that always send `{}` don't error.
const bodySchema = z.object({}).passthrough();

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewContract(auth.role))
      throw new ForbiddenError("Cannot view contracts");
    if (!canAmendContract(auth.role))
      throw new ForbiddenError(
        "MANAGER+ required to dispatch renewal notifications",
      );
  },
  params: paramsSchema,
  body: bodySchema,
  handler: async ({ auth, params, request }) => {
    const contract = await prisma.contract.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        contractNumber: true,
        type: true,
        state: true,
        endDate: true,
        customer: {
          select: {
            id: true,
            name: true,
            contacts: {
              where: { role: "CONTRACT_PARTY" },
              select: { id: true, language: true, phone1: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!contract) throw new NotFoundError("Contract not found");
    if (contract.type !== "RENTAL") {
      throw new ValidationError(
        "Renewal SMS is only applicable to RENTAL contracts",
      );
    }
    if (contract.state !== "ACTIVE") {
      throw new ValidationError(
        "Renewal SMS is only applicable to ACTIVE contracts",
      );
    }
    const contact = contract.customer.contacts[0];
    if (!contact) {
      throw new ValidationError(
        "Customer has no CONTRACT_PARTY contact to notify",
      );
    }
    if (!contract.endDate) {
      throw new ValidationError(
        "Contract has no end date — cannot compute remaining days",
      );
    }

    const now = new Date();
    const daysRemaining = Math.max(
      0,
      Math.floor(
        (contract.endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );

    await sendNotification({
      templateCode: "SMS_CONTRACT_RENEWAL_FINAL",
      customerContactId: contact.id,
      locale: (contact.language ?? "vi") as NotificationLocale,
      vars: {
        name: contract.customer.name,
        contract_no: contract.contractNumber,
        end_date: contract.endDate.toISOString().slice(0, 10),
        days_remaining: String(daysRemaining),
        url: "https://portal.seoulaqua.com.vn",
        hq_phone: "028-1234-5678",
      },
      actorType: "USER",
      actorId: auth.userId,
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_NOTIFY_RENEWAL",
      entityType: "Contract",
      entityId: contract.id,
      after: {
        contractNumber: contract.contractNumber,
        contactId: contact.id,
        daysRemaining,
      },
      request: request ?? null,
    });

    return { sent: true, daysRemaining };
  },
});
