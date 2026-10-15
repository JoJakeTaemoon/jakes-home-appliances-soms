/**
 * GET /api/mobile/visits/[id]/preview/[kind]
 *
 * Mobile-side preview of the visit document the technician needs the
 * customer to sign. TECHNICIAN-only; scoped to visits the caller is
 * lead or collaborator on. Visit documents are rendered in-memory and
 * streamed — no disk write, no Document row.
 *
 * `CONTRACT` (INSTALLATION visits only) streams the customer's current
 * contract — the one the detail page lists — the same way the office-only
 * /api/contracts/[id]/pdf does: an uploaded signed copy wins, else the
 * latest rendered PDF, rendering + persisting it on first view.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { requireFieldAuth } from "@/lib/auth/field-guards";
import { toErrorResponse } from "@/lib/api/response";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { registerFonts } from "@/lib/pdf/fonts";
import { getLatestPdf, renderPdf } from "@/lib/pdf/renderer";
import { langPairForLocale, type PdfLangPair } from "@/lib/pdf/types";
import {
  buildPreviewElement,
  isPreviewKind,
  suggestedFilename,
} from "@/lib/pdf/visit-preview";
import { findLatestContract } from "../../latest-contract";

interface Ctx {
  params: Promise<{ id: string; kind: string }>;
}

function langPairFromQuery(url: URL): PdfLangPair {
  const qPair = url.searchParams.get("langPair");
  if (qPair === "vi-ko" || qPair === "vi-en") return qPair;
  return langPairForLocale(url.searchParams.get("locale"));
}

function pdfResponse(buf: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// ponytail: mirrors /api/contracts/[id]/pdf (office realm); lift both into
// src/lib/pdf if a third caller appears.
async function contractPdf(
  contract: { id: string; pdfStorageKey: string | null },
  userId: string,
) {
  if (contract.pdfStorageKey) {
    const abs = path.isAbsolute(contract.pdfStorageKey)
      ? contract.pdfStorageKey
      : path.join(process.cwd(), contract.pdfStorageKey);
    if (!fs.existsSync(abs)) throw new NotFoundError("Uploaded PDF missing on disk");
    return pdfResponse(await fs.promises.readFile(abs), path.basename(abs));
  }
  let latest = await getLatestPdf("CONTRACT", contract.id);
  if (!latest || !fs.existsSync(latest.absolutePath)) {
    // No langPair: the renderer uses the Contract Party's language, which is
    // what the office renders too.
    await renderPdf({ kind: "CONTRACT", refId: contract.id, generatedById: userId });
    latest = await getLatestPdf("CONTRACT", contract.id);
  }
  if (!latest || !fs.existsSync(latest.absolutePath)) {
    throw new NotFoundError("Could not generate or locate contract PDF");
  }
  return pdfResponse(await fs.promises.readFile(latest.absolutePath), latest.filename);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFieldAuth(request);
    const { id, kind } = await ctx.params;

    const visit = await prisma.visit.findUnique({
      where: { id },
      select: {
        type: true,
        customerId: true,
        leadTechnicianId: true,
        collaboratorTechnicianIds: true,
      },
    });
    if (!visit) throw new NotFoundError("Visit not found");
    const allowed =
      visit.leadTechnicianId === auth.userId ||
      visit.collaboratorTechnicianIds.includes(auth.userId);
    if (!allowed) {
      throw new NotFoundError("Visit not found");
    }

    const kindUpper = kind.toUpperCase();
    if (kindUpper === "CONTRACT") {
      if (visit.type !== "INSTALLATION") throw new NotFoundError("Contract not found");
      const contract = await findLatestContract(visit.customerId);
      if (!contract) throw new NotFoundError("Contract not found");
      return await contractPdf(contract, auth.userId);
    }
    if (!isPreviewKind(kindUpper)) {
      throw new ValidationError(
        `Unknown document kind: ${kind}. Expected one of: CONTRACT, DELIVERY_RECEIPT, SALE_RECEIPT_B2C, DELIVERY_SLIP_B2B, PERIODIC_CHECK_B2C, PERIODIC_CHECK_B2B, WORK_CONFIRMATION`,
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
