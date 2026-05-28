/**
 * GET /api/tax-invoices/[id]/pdf — stream the uploaded (or rendered) PDF.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { canViewPaymentList } from "@/lib/payments/access";
import { renderPdf } from "@/lib/pdf/renderer";
import { langPairForLocale } from "@/lib/pdf/types";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canViewPaymentList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
    const { id } = await ctx.params;
    const inv = await prisma.taxInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundError("TaxInvoice not found");

    let storageKey = inv.pdfStorageKey;
    if (!storageKey) {
      const url = new URL(request.url);
      const result = await renderPdf({
        kind: "TAX_INVOICE",
        refId: id,
        langPair: langPairForLocale(url.searchParams.get("locale")),
        generatedById: auth.userId,
      });
      storageKey = result.storageKey;
    }

    const absolutePath = path.isAbsolute(storageKey)
      ? storageKey
      : path.join(process.cwd(), storageKey);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundError("PDF missing on disk");
    }
    const buffer = await fsp.readFile(absolutePath);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(inv.invoiceNumber ?? inv.id).replace(/[^A-Za-z0-9-_.]/g, "_")}.pdf"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
