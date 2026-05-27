/**
 * GET  /api/payments/[id]/receipt-pdf — stream the most recent receipt PDF
 * POST /api/payments/[id]/receipt-pdf — regenerate the PDF
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  ForbiddenError,
  NotFoundError,
} from "@/lib/api/error";
import { PaymentWorkflow } from "@/lib/payments/workflow";
import { renderPdf } from "@/lib/pdf/renderer";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function ensureAccess(
  request: NextRequest,
  paymentId: string,
): Promise<{ collectedById: string | null }> {
  const auth = await requireAuth(request);
  if (!PaymentWorkflow.access.canViewList(auth.role)) {
    throw new ForbiddenError("Insufficient role");
  }
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { collectedById: true },
  });
  if (!payment) throw new NotFoundError("Payment not found");
  const scope = PaymentWorkflow.access.scopeForActor(auth.role, auth.userId);
  if ("collectedById" in scope && payment.collectedById !== scope.collectedById) {
    throw new NotFoundError("Payment not found");
  }
  return payment;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await ensureAccess(request, id);
    // Find the most recent receipt document
    let receipt = await prisma.document.findFirst({
      where: { paymentId: id, kind: "RECEIPT" },
      orderBy: { generatedAt: "desc" },
    });
    if (!receipt) {
      // Generate on first download
      const url = new URL(request.url);
      const locale = (url.searchParams.get("locale") as "ko" | "vi" | "en") ?? "vi";
      await renderPdf({ kind: "RECEIPT", refId: id, locale });
      receipt = await prisma.document.findFirst({
        where: { paymentId: id, kind: "RECEIPT" },
        orderBy: { generatedAt: "desc" },
      });
    }
    if (!receipt) throw new NotFoundError("Receipt PDF not available");

    const absolutePath = path.isAbsolute(receipt.storageKey)
      ? receipt.storageKey
      : path.join(process.cwd(), receipt.storageKey);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundError("Receipt file missing on disk");
    }
    const buffer = await fsp.readFile(absolutePath);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${receipt.filename}"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const auth = await requireAuth(request);
    if (!PaymentWorkflow.access.canViewList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    const url = new URL(request.url);
    const locale =
      (url.searchParams.get("locale") as "ko" | "vi" | "en" | null) ?? "vi";
    const result = await renderPdf({
      kind: "RECEIPT",
      refId: id,
      locale,
      generatedById: auth.userId,
    });
    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
