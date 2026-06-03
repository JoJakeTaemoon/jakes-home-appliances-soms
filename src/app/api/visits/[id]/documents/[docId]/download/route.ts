/**
 * GET /api/visits/[id]/documents/[docId]/download — stream a previously
 * issued visit document PDF. Office STAFF+ only.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/response";
import { NotFoundError } from "@/lib/api/error";

interface Ctx {
  params: Promise<{ id: string; docId: string }>;
}

function toAbsolute(storageKey: string): string {
  return path.isAbsolute(storageKey)
    ? storageKey
    : path.join(process.cwd(), storageKey);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const { id, docId } = await ctx.params;

    const doc = await prisma.document.findFirst({
      where: { id: docId, visitId: id },
      select: { storageKey: true, filename: true, mimeType: true },
    });
    if (!doc) throw new NotFoundError("Document not found");

    const abs = toAbsolute(doc.storageKey);
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
