/**
 * POST /api/visits/[id]/issue-document
 *
 * Track 3 — office STAFF+ issues a visit document. Enforces the D3
 * policy (visit must be SCHEDULED+ AND have a lead technician). Existing
 * same-kind documents are auto-archived by the renderer.
 *
 * Body: { kind: VisitDocumentKind, langPair?: "vi-ko" | "vi-en" }
 * Response: { documentId, kind, storageKey, sizeBytes, templateCode, reissued }
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { renderPdf, type PdfKind } from "@/lib/pdf/renderer";
import { canIssueVisitDocument } from "@/lib/visits/document-policy";
import { issueDocumentSchema } from "@/lib/validators/visit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const { id } = await ctx.params;

    const body = await request.json().catch(() => ({}));
    const parsed = issueDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid issue-document payload",
        parsed.error.issues.map((i) => ({
          path: i.path.filter(
            (p): p is string | number =>
              typeof p === "string" || typeof p === "number",
          ),
          message: i.message,
        })),
      );
    }
    const { kind, langPair } = parsed.data;

    const visit = await prisma.visit.findUnique({
      where: { id },
      select: { id: true, state: true, leadTechnicianId: true },
    });
    if (!visit) throw new NotFoundError("Visit not found");

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

    // Was a prior version of the *same* kind already on disk? Lets the
    // UI label the action as "재발급" instead of "발급" + drives the
    // AuditLog action enum below.
    const prior = await prisma.document.findFirst({
      where: { visitId: id, kind: kind },
      orderBy: { generatedAt: "desc" },
      select: { id: true, storageKey: true },
    });
    const reissued = !!prior;

    const result = await renderPdf({
      kind: kind as PdfKind,
      refId: id,
      langPair,
      generatedById: auth.userId,
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: reissued ? "DOCUMENT_REISSUED" : "DOCUMENT_ISSUED",
      entityType: "Visit",
      entityId: id,
      before: prior ? { documentId: prior.id, storageKey: prior.storageKey } : null,
      after: {
        documentId: result.documentId,
        kind,
        storageKey: result.storageKey,
        templateCode: result.templateCode,
        langPair: langPair ?? "vi-ko",
      },
      request,
    });

    return successResponse({
      documentId: result.documentId,
      kind,
      storageKey: result.storageKey,
      sizeBytes: result.sizeBytes,
      templateCode: result.templateCode,
      reissued,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
