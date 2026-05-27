/**
 * POST /api/contracts/[id]/email — UC-CT-10.
 *
 * Phase 3.5: dispatches via the notification factory
 * (`src/lib/notifications/send.ts`). Provider is picked by env
 * (EMAIL_PROVIDER=mock|resend); mock is the default and writes a
 * NotificationLog row with status=MOCKED so flows are visible during dev.
 *
 * Requires a Document row (CONTRACT, latest) — if none exists yet, we render
 * the PDF first so the customer always receives the freshest copy.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { contractEmailSchema } from "@/lib/validators/contract";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { getLatestPdf, renderPdf } from "@/lib/pdf/renderer";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import type { PdfLocale } from "@/lib/pdf/types";
import type { NotificationLocale } from "@/lib/notifications/types";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!ContractWorkflow.access.canEmail(auth.role)) {
      throw new ForbiddenError("Cannot email contracts");
    }
    const { id } = await ctx.params;

    const body = await request.json().catch(() => ({}));
    const parsed = contractEmailSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid email payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            contacts: { where: { role: "CONTRACT_PARTY" }, take: 1 },
          },
        },
      },
    });
    if (!contract) throw new NotFoundError("Contract not found");

    const cp = contract.customer.contacts[0];
    const recipient = parsed.data.recipientEmail ?? cp?.email ?? null;
    if (!recipient) {
      throw new ValidationError("No Contract Party email on file");
    }
    const locale: PdfLocale =
      parsed.data.locale ??
      (cp?.language === "ko" || cp?.language === "vi" || cp?.language === "en"
        ? cp.language
        : "vi");

    // Ensure a fresh PDF exists.
    let pdf = await getLatestPdf("CONTRACT", id);
    if (!pdf) {
      await renderPdf({ kind: "CONTRACT", refId: id, locale, generatedById: auth.userId });
      pdf = await getLatestPdf("CONTRACT", id);
    }
    if (!pdf) {
      throw new NotFoundError("Could not generate contract PDF");
    }

    // Dispatch via the notification factory. We always pass an inline contact
    // override because the caller may have specified a custom `recipientEmail`
    // that doesn't match the Contract Party's stored email.
    const [result] = await sendNotification({
      templateCode: "EMAIL_CONTRACT_COPY",
      contactOverride: {
        customerId: contract.customer.id,
        contactId: cp?.id ?? null,
        phone1: cp?.phone1 ?? "",
        email: recipient,
        smsOptOut: false,
        emailOptOut: false, // EMAIL_CONTRACT_COPY is category=SYSTEM anyway
        language: locale as NotificationLocale,
      },
      vars: {
        name: cp?.name ?? contract.customer.name,
        contract_no: contract.contractNumber,
        issued_at: (contract.signedByCompanyAt ?? contract.createdAt)
          .toISOString()
          .slice(0, 10),
        hq_phone: "028-1234-5678",
      },
      locale: locale as NotificationLocale,
      actorId: auth.userId,
      actorType: "USER",
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_EMAILED",
      entityType: "Contract",
      entityId: id,
      after: {
        notificationLogId: result?.notificationLogId,
        recipient,
        locale,
        storageKey: pdf.storageKey,
        status: result?.status,
      },
      request,
    });

    return successResponse({
      notificationLogId: result?.notificationLogId,
      recipient,
      locale,
      status: result?.status ?? "FAILED",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
