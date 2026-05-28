/**
 * GET /api/contracts/[id]/pdf — stream the latest contract PDF.
 *
 * If no Document row exists yet (first download), render-on-the-fly using
 * the Contract Party's language and persist a Document row.
 *
 * Office roles (STAFF+) can download. Returns 200 with `application/pdf`.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { requireAuth } from "@/lib/auth/guards";
import { ContractWorkflow } from "@/lib/contracts/workflow";
import { toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { getLatestPdf, renderPdf } from "@/lib/pdf/renderer";
import prisma from "@/lib/prisma";
import { langPairForLocale, type PdfLangPair } from "@/lib/pdf/types";

interface Ctx { params: Promise<{ id: string }> }

/**
 * Documents are bilingual (Vietnamese primary + secondary). Resolve the
 * secondary language: explicit `?langPair=` wins, then `?locale=` (en → vi-en),
 * else the Contract Party's preferred language.
 */
async function resolveLangPair(contractId: string, url: URL): Promise<PdfLangPair> {
  const qPair = url.searchParams.get("langPair");
  if (qPair === "vi-ko" || qPair === "vi-en") return qPair;
  const qLocale = url.searchParams.get("locale");
  if (qLocale) return langPairForLocale(qLocale);
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      customer: {
        select: {
          contacts: { where: { role: "CONTRACT_PARTY" }, take: 1, select: { language: true } },
        },
      },
    },
  });
  return langPairForLocale(contract?.customer.contacts[0]?.language);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    // Office roles (STAFF+) — canEmailContract is also our generic office gate.
    if (!ContractWorkflow.access.canEmail(auth.role)) throw new ForbiddenError("Cannot download contract PDF");
    const { id } = await ctx.params;

    let existing = await getLatestPdf("CONTRACT", id);
    let absentOnDisk = !existing || !fs.existsSync(existing.absolutePath);

    if (!existing || absentOnDisk) {
      const langPair = await resolveLangPair(id, new URL(request.url));
      // Will throw NotFoundError if the contract does not exist.
      await renderPdf({ kind: "CONTRACT", refId: id, langPair, generatedById: auth.userId });
      existing = await getLatestPdf("CONTRACT", id);
      absentOnDisk = !existing || !fs.existsSync(existing.absolutePath);
    }

    if (!existing || absentOnDisk) {
      throw new NotFoundError("Could not generate or locate contract PDF");
    }

    const buf = await fs.promises.readFile(existing.absolutePath);
    // Convert Node Buffer to a Uint8Array — NextResponse accepts Uint8Array as a Body.
    const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${existing.filename}"`,
        "content-length": String(buf.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
