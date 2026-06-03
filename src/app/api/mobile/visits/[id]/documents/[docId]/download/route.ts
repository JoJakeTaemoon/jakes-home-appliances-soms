/**
 * GET /api/mobile/visits/[id]/documents/[docId]/download
 *
 * Mobile field-side download for visit documents. TECHNICIAN only.
 * Scope: caller must be either the visit's leadTechnician or a listed
 * collaborator. Anything else returns 404.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { requireFieldAuth } from "@/lib/auth/field-guards";
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
    const auth = await requireFieldAuth(request);
    const { id, docId } = await ctx.params;

    const visit = await prisma.visit.findUnique({
      where: { id },
      select: { leadTechnicianId: true, collaboratorTechnicianIds: true },
    });
    if (!visit) throw new NotFoundError("Visit not found");

    const allowed =
      visit.leadTechnicianId === auth.userId ||
      visit.collaboratorTechnicianIds.includes(auth.userId);
    if (!allowed) {
      // 404 (not 403) so we don't leak existence to unrelated techs.
      throw new NotFoundError("Visit not found");
    }

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
