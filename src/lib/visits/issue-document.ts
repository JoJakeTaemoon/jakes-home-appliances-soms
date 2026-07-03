/**
 * Shared visit-document issuance path — used by both the interactive
 * office CTA (`POST /api/visits/[id]/issue-document`) and the auto-issue
 * queue drained by `VisitWorkflow.schedule` when a visit has
 * `pendingDocumentKinds` set (e.g. a consumable order was placed on it
 * pre-schedule and the delivery slip should render the moment the
 * office confirms the trip).
 *
 * Handles the policy check + prior-doc lookup + PDF render + audit
 * write. Callers get back the render result or throw on policy /
 * render failure.
 */

import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";
import { ValidationError } from "@/lib/api/error";
import { renderPdf, type PdfKind } from "@/lib/pdf/renderer";
import type { PdfLangPair } from "@/lib/pdf/types";
import { canIssueVisitDocument } from "@/lib/visits/document-policy";
import { logAudit } from "@/lib/audit";

export interface IssueVisitDocumentInput {
  visitId: string;
  kind: PdfKind;
  langPair?: PdfLangPair;
  /** Actor id — used for the audit row + generatedById on the doc. */
  actorId: string;
  request?: NextRequest | null;
}

export interface IssueVisitDocumentResult {
  documentId: string;
  kind: PdfKind;
  storageKey: string;
  sizeBytes: number;
  templateCode: string;
  reissued: boolean;
}

export async function issueVisitDocument({
  visitId,
  kind,
  langPair,
  actorId,
  request,
}: IssueVisitDocumentInput): Promise<IssueVisitDocumentResult> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { id: true, state: true, leadTechnicianId: true },
  });
  if (!visit) throw new ValidationError("Visit not found");

  const policy = canIssueVisitDocument({
    state: visit.state,
    leadTechnicianId: visit.leadTechnicianId,
  });
  if (!policy.allowed) {
    let message = "Cannot issue documents for a failed-no-show visit";
    if (policy.reason === "VISIT_UNASSIGNED") {
      message =
        "Visit must be SCHEDULED with a lead technician before documents can be issued";
    } else if (policy.reason === "VISIT_CANCELLED") {
      message = "Cannot issue documents for a cancelled visit";
    }
    throw new ValidationError(message, [
      { path: ["state"], message: policy.reason ?? "UNKNOWN" },
    ]);
  }

  const prior = await prisma.document.findFirst({
    where: { visitId, kind },
    orderBy: { generatedAt: "desc" },
    select: { id: true, storageKey: true },
  });
  const reissued = !!prior;

  const result = await renderPdf({
    kind,
    refId: visitId,
    langPair,
    generatedById: actorId,
  });

  await logAudit({
    actorType: "USER",
    actorId,
    action: reissued ? "DOCUMENT_REISSUED" : "DOCUMENT_ISSUED",
    entityType: "Visit",
    entityId: visitId,
    before: prior ? { documentId: prior.id, storageKey: prior.storageKey } : null,
    after: {
      documentId: result.documentId,
      kind,
      storageKey: result.storageKey,
      templateCode: result.templateCode,
      langPair: langPair ?? "vi-ko",
    },
    request: request ?? null,
  });

  return {
    documentId: result.documentId,
    kind,
    storageKey: result.storageKey,
    sizeBytes: result.sizeBytes,
    templateCode: result.templateCode,
    reissued,
  };
}

/**
 * Resolve the customer-appropriate delivery document kind for a
 * **purchase order** (`CONSUMABLE_DELIVERY` flow). B2C treats it as an
 * outright sale (판매영수증 `SALE_RECEIPT_B2C`), B2B as goods handoff
 * (Mẫu số 02-VT 출고서 `DELIVERY_SLIP_B2B`).
 *
 * Not used for RENTAL installations — those go through
 * `suggestVisitDocumentKind({visitType:"INSTALLATION"})` and continue to
 * emit `DELIVERY_RECEIPT` (납품·수령서) for B2C rentals.
 */
export function deliveryKindForCustomerType(
  customerType: "B2C" | "B2B",
): PdfKind {
  return customerType === "B2B" ? "DELIVERY_SLIP_B2B" : "SALE_RECEIPT_B2C";
}
