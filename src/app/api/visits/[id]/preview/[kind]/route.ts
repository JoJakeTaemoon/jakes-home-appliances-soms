/**
 * GET /api/visits/[id]/preview/[kind]
 *
 * Sample-first preview endpoint for the 6 visit documents. Renders the
 * PDF in memory and streams it without writing to disk and without
 * creating a Document row. Used during the iterative design phase so
 * STAFF+ users can eyeball each format before the production
 * "issue document" flow lands (Track 3 of the visit-mgmt deep dive).
 *
 *   kind ∈ DELIVERY_RECEIPT | SALE_RECEIPT_B2C | DELIVERY_SLIP_B2B
 *        | PERIODIC_CHECK_B2C | PERIODIC_CHECK_B2B | WORK_CONFIRMATION
 *   ?langPair=vi-ko (default) | vi-en
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
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
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const { id, kind } = await ctx.params;
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
