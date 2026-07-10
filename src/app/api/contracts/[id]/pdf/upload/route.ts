/**
 * POST /api/contracts/[id]/pdf/upload — manual contract-PDF override.
 *
 * Office uploads a scanned/signed PDF that should be served instead of the
 * auto-rendered contract PDF (e.g. a wet-signed copy). MANAGER+ only.
 * Mirrors the tax-invoice upload intake (src/app/api/tax-invoices/route.ts).
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import { storeContractPdf } from "@/lib/contracts/pdf-upload";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!ContractWorkflow.access.canRegeneratePdf(auth.role)) {
      throw new ForbiddenError("Only managers can upload contract PDFs");
    }
    const { id } = await ctx.params;

    const contract = await prisma.contract.findUnique({ where: { id }, select: { id: true } });
    if (!contract) throw new NotFoundError("Contract not found");

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new ValidationError("multipart/form-data required");
    }
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      throw new ValidationError("Missing file");
    }
    if (file.type && file.type !== "application/pdf") {
      throw new ValidationError("Only application/pdf uploads are accepted");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new ValidationError("PDF exceeds 10MB");
    }

    const { storageKey, uploadedAt } = await storeContractPdf(id, buffer);

    const updated = await prisma.contract.update({
      where: { id },
      data: { pdfStorageKey: storageKey, pdfUploadedAt: uploadedAt },
      select: { id: true, pdfStorageKey: true, pdfUploadedAt: true },
    });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_PDF_UPLOADED",
      entityType: "Contract",
      entityId: id,
      after: { storageKey, uploadedAt },
      request,
    });

    return successResponse(updated, 200);
  } catch (err) {
    return toErrorResponse(err);
  }
}
