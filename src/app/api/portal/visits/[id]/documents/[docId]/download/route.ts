/**
 * GET /api/portal/visits/[id]/documents/[docId]/download — the customer
 * streams a visit document (작업확인서 / 정기점검표). Same scope as
 * GET /api/portal/visits/[id]: own customer only, and a SITE-scoped OPS
 * contact only their site. Anything else is 404 so ids don't leak.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { toErrorResponse } from "@/lib/api/response";
import { NotFoundError } from "@/lib/api/error";

interface Ctx {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireCustomerAuth(request);
    const { id, docId } = await ctx.params;

    const visit = await prisma.visit.findUnique({
      where: { id },
      select: { customerId: true, siteId: true },
    });
    if (
      !visit ||
      visit.customerId !== auth.customerId ||
      (auth.scope === "SITE" && auth.siteId && visit.siteId !== auth.siteId)
    ) {
      throw new NotFoundError("Visit not found");
    }

    const doc = await prisma.document.findFirst({
      where: { id: docId, visitId: id },
      select: { storageKey: true, filename: true, mimeType: true },
    });
    if (!doc) throw new NotFoundError("Document not found");

    const abs = path.isAbsolute(doc.storageKey)
      ? doc.storageKey
      : path.join(process.cwd(), doc.storageKey);
    if (!fs.existsSync(abs)) {
      throw new NotFoundError("Document file missing on disk");
    }
    const buffer = await fsp.readFile(abs);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/pdf",
        "Content-Disposition": `inline; filename="${doc.filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
