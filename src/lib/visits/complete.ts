/**
 * Visit completion side-effects (UC-VS-06).
 *
 *   1. Update Visit: state COMPLETED, findings, parts, photos, signature,
 *      completedAt.
 *   2. If `collectedAmount > 0` — create a Payment row tied to the visit +
 *      lead technician (CASH default, state COLLECTED).
 *   3. Render the work-confirmation PDF (creates a Document row).
 *   4. Queue EMAIL_VISIT_COMPLETED to the primary OPS contact (fallback:
 *      contract party) via `sendNotification`.
 *   5. AuditLog.
 *
 * Kept here as a module-level helper so the mobile API route stays
 * readable and the test harness can exercise the path directly.
 */

import path from "node:path";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import { renderWorkConfirmationPdf } from "@/lib/pdf/work-confirmation-render";
import { recordCashCollection } from "@/lib/payments/operations";
import {
  planVisitTransition,
  type VisitState,
} from "@/lib/visits/state";
import { completeSrFromVisit } from "@/lib/service-requests/operations";
import type { Prisma } from "@/generated/prisma/client";
import type { CompleteVisitInput } from "@/lib/validators/visit";

export interface CompleteVisitArgs {
  visitId: string;
  actorUserId: string;
  input: CompleteVisitInput;
  locale: "ko" | "vi" | "en";
}

export interface CompleteVisitResult {
  visitId: string;
  paymentId: string | null;
  workConfirmation: {
    storageKey: string;
    documentId: string;
  };
  notificationsQueued: number;
}

function buildPhotosJson(input: CompleteVisitInput): Prisma.InputJsonValue {
  return input.photos.map((p) => ({
    storageKey: p.storageKey,
    takenAt: p.takenAt ? p.takenAt.toISOString() : undefined,
  })) as unknown as Prisma.InputJsonValue;
}

function buildPartsJson(input: CompleteVisitInput): Prisma.InputJsonValue {
  return [...input.partsReplaced] as unknown as Prisma.InputJsonValue;
}

function selectOpsContact(
  contacts: { id: string; isPrimary: boolean; scope: string; siteId: string | null; role: string }[],
  siteId: string | null,
): string | null {
  const ops = contacts.filter((c) => c.role === "OPS_CONTACT");
  // Prefer site-scoped match
  if (siteId) {
    const siteScoped = ops.find(
      (c) => c.scope === "SITE" && c.siteId === siteId && c.isPrimary,
    );
    if (siteScoped) return siteScoped.id;
  }
  const customerScoped = ops.find(
    (c) => c.scope === "CUSTOMER" && c.isPrimary,
  );
  if (customerScoped) return customerScoped.id;
  const anyPrimary = ops.find((c) => c.isPrimary);
  if (anyPrimary) return anyPrimary.id;
  return ops[0]?.id ?? null;
}

export async function completeVisit(args: CompleteVisitArgs): Promise<CompleteVisitResult> {
  const { visitId, actorUserId, input, locale } = args;

  const current = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          contacts: {
            select: {
              id: true,
              role: true,
              scope: true,
              siteId: true,
              isPrimary: true,
              language: true,
              email: true,
              phone1: true,
            },
          },
        },
      },
      serviceRequest: { select: { id: true, state: true } },
    },
  });
  if (!current) throw new Error("Visit not found");

  const plan = planVisitTransition(
    current.state as VisitState,
    "COMPLETED",
  );

  const photosJson = buildPhotosJson(input);
  const partsJson = buildPartsJson(input);

  // Concurrency guard: include the pre-transition state in WHERE so two
  // concurrent completion calls don't both succeed. If the state changed
  // between findUnique and update, Prisma throws P2025 (record not found).
  let updated;
  try {
    updated = await prisma.visit.update({
      where: { id: visitId, state: current.state },
      data: {
        ...plan,
        findings: input.findings,
        partsReplaced: partsJson,
        photos: photosJson,
        customerSignaturePhotoUrl: input.customerSignaturePhotoStorageKey,
      },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      throw new Error(
        "Visit state changed concurrently — refresh and try again",
      );
    }
    throw err;
  }

  // Payment row (optional) — routes through the Payment ops module so the
  // receipt email + audit log live in one place (UC-PY-01).
  let paymentId: string | null = null;
  if (input.collectedAmount !== null && input.collectedAmount !== undefined) {
    const expectedAmount = current.expectedAmount ?? 0;
    const expectedNum =
      typeof expectedAmount === "object"
        ? Number(expectedAmount.toString())
        : Number(expectedAmount);
    const collection = await recordCashCollection({
      visitId,
      customerId: current.customerId,
      collectedById: actorUserId,
      actualAmount: input.collectedAmount,
      expectedAmount: expectedNum > 0 ? expectedNum : input.collectedAmount,
      method: input.paymentMethod ?? "CASH",
    });
    paymentId = collection.paymentId;
  }

  // Render PDF
  const wc = await renderWorkConfirmationPdf(visitId, locale, {
    generatedById: actorUserId,
  });

  // Queue EMAIL_VISIT_COMPLETED — best effort, swallow failures so the
  // technician's completion doesn't bounce.
  const contactId = selectOpsContact(
    current.customer.contacts.map((c) => ({
      id: c.id,
      role: c.role,
      scope: c.scope,
      siteId: c.siteId ?? null,
      isPrimary: c.isPrimary,
    })),
    current.siteId ?? null,
  );

  let notificationsQueued = 0;
  if (contactId) {
    try {
      const lead = await prisma.user.findUnique({
        where: { id: actorUserId },
        select: { username: true },
      });
      const next = await prisma.visit.findFirst({
        where: {
          customerId: current.customerId,
          state: { in: ["SCHEDULED", "SUGGESTED"] },
          scheduledFor: { gt: new Date() },
        },
        orderBy: { scheduledFor: "asc" },
        select: { scheduledFor: true },
      });
      const dateStr = updated.completedAt
        ? updated.completedAt.toISOString().slice(0, 10)
        : "";
      const timeStr = updated.completedAt
        ? updated.completedAt.toISOString().slice(11, 16)
        : "";
      const results = await sendNotification({
        templateCode: "EMAIL_VISIT_COMPLETED",
        customerContactId: contactId,
        vars: {
          name: current.customer.name,
          visit_no: visitId.slice(-12).toUpperCase(),
          date: dateStr,
          time: timeStr,
          technician: lead?.username ?? "—",
          summary: input.findings.slice(0, 200),
          parts_replaced: input.partsReplaced.join(", ") || "—",
          next_date: next?.scheduledFor
            ? next.scheduledFor.toISOString().slice(0, 10)
            : "—",
          url: `/portal/visits/${visitId}`,
          hq_phone: "+84-28-1234-5678",
        },
        actorId: actorUserId,
        actorType: "USER",
      });
      notificationsQueued = results.filter((r) => r.status !== "SKIPPED").length;
    } catch (err) {
      console.error("[visits/complete] notification failed:", err);
    }
  }

  // If this visit was spawned from a ServiceRequest, lift it to COMPLETED.
  if (current.serviceRequest) {
    try {
      await completeSrFromVisit(current.serviceRequest.id);
    } catch (err) {
      console.error("[visits/complete] SR completion failed:", err);
    }
  }

  await logAudit({
    actorType: "USER",
    actorId: actorUserId,
    action: "VISIT_COMPLETE",
    entityType: "Visit",
    entityId: visitId,
    before: { state: current.state },
    after: {
      state: updated.state,
      completedAt: updated.completedAt,
      paymentId,
      workConfirmationDoc: path.basename(wc.storageKey),
      serviceRequestId: current.serviceRequest?.id ?? null,
    },
  });

  return {
    visitId,
    paymentId,
    workConfirmation: {
      storageKey: wc.storageKey,
      documentId: wc.documentId,
    },
    notificationsQueued,
  };
}
