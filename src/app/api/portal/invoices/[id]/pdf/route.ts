/**
 * GET /api/portal/invoices/[id]/pdf — customer streams their own tax invoice.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { renderPdf } from "@/lib/pdf/renderer";
import { langPairForLocale } from "@/lib/pdf/types";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireCustomerAuth(request);
    if (caller.customerType !== "B2B") {
      throw new ForbiddenError("Tax invoices are B2B only");
    }
    const { id } = await ctx.params;
    const inv = await prisma.taxInvoice.findUnique({
      where: { id },
      include: { payment: { select: { customerId: true } } },
    });
    if (!inv || inv.payment.customerId !== caller.customerId) {
      throw new NotFoundError("Invoice not found");
    }
    let storageKey = inv.pdfStorageKey;
    if (!storageKey) {
      const result = await renderPdf({
        kind: "TAX_INVOICE",
        refId: id,
        langPair: langPairForLocale(caller.language),
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
