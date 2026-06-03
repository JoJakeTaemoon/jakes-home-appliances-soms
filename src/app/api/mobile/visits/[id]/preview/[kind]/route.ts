/**
 * GET /api/mobile/visits/[id]/preview/[kind]
 *
 * Mobile-side preview of the visit document the technician needs the
 * customer to sign. TECHNICIAN-only; scoped to visits the caller is
 * lead or collaborator on. The PDF is rendered in-memory and streamed
 * — no disk write, no Document row.
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { requireFieldAuth } from "@/lib/auth/field-guards";
import { toErrorResponse } from "@/lib/api/response";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { registerFonts } from "@/lib/pdf/fonts";
import { langPairForLocale, type PdfLangPair } from "@/lib/pdf/types";
import {
  buildPreviewElement,
  isPreviewKind,
  suggestedFilename,
} from "@/lib/pdf/visit-preview";

interface Ctx {
  params: Promise<{ id: string; kind: string }>;
}

function langPairFromQuery(url: URL): PdfLangPair {
  const qPair = url.searchParams.get("langPair");
  if (qPair === "vi-ko" || qPair === "vi-en") return qPair;
  return langPairForLocale(url.searchParams.get("locale"));
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFieldAuth(request);
    const { id, kind } = await ctx.params;

    const visit = await prisma.visit.findUnique({
      where: { id },
      select: { leadTechnicianId: true, collaboratorTechnicianIds: true },
    });
    if (!visit) throw new NotFoundError("Visit not found");
    const allowed =
      visit.leadTechnicianId === auth.userId ||
      visit.collaboratorTechnicianIds.includes(auth.userId);
    if (!allowed) {
      throw new NotFoundError("Visit not found");
    }

    const kindUpper = kind.toUpperCase();
    if (!isPreviewKind(kindUpper)) {
      throw new ValidationError(
        `Unknown document kind: ${kind}. Expected one of: DELIVERY_RECEIPT, SALE_RECEIPT_B2C, DELIVERY_SLIP_B2B, PERIODIC_CHECK_B2C, PERIODIC_CHECK_B2B, WORK_CONFIRMATION`,
      );
    }
    const url = new URL(request.url);
    const langPair = langPairFromQuery(url);

    registerFonts();
    const element = await buildPreviewElement(id, kindUpper, langPair);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${suggestedFilename(id, kindUpper)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
