/**
 * GET /api/visits/print-bundle/pdf?date=YYYY-MM-DD&technicianId=<id>&langPair=vi-ko
 *
 * Track 4 — bulk-print **single merged PDF** for the operator to send
 * to the printer. For each visit on the day, in scheduledFor order:
 *
 *   1. INSTALLATION: contract PDF × 2 (customer + company copy) — the
 *      exact same file `/o/contracts/{id}` shows, fetched from disk.
 *   2. The visit's auto-suggested document PDF (delivery receipt /
 *      sale receipt / B2B delivery slip / periodic check / work
 *      confirmation) rendered in memory.
 *
 * All pages are merged with `pdf-lib` into one buffer so a browser
 * print preview honours the embedded A4 size rather than scaling the
 * iframe content like it does when each PDF is a separate iframe.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { registerFonts } from "@/lib/pdf/fonts";
import { langPairForLocale, type PdfLangPair } from "@/lib/pdf/types";
import {
  suggestVisitDocumentKind,
  type CustomerTypeForSuggest,
  type VisitTypeForSuggest,
} from "@/lib/visits/document-suggest";
import { buildPreviewElement } from "@/lib/pdf/visit-preview";
import { renderPdf, getLatestPdf } from "@/lib/pdf/renderer";

function startEndOfDay(yyyymmdd: string): { start: Date; end: Date } {
  const [y, m, d] = yyyymmdd
    .split("-")
    .map((p) => Number.parseInt(p, 10));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

function parseLangPair(s: string | null): PdfLangPair {
  if (s === "vi-ko" || s === "vi-en") return s;
  return langPairForLocale(null);
}

async function loadContractPdf(contractId: string): Promise<Buffer | null> {
  // Prefer the file already on disk — the contracts menu rendered it
  // when the user opened /o/contracts/{id}. Render on first access
  // otherwise so the bulk-print endpoint never returns "not yet
  // generated" for a freshly seeded contract.
  let info = await getLatestPdf("CONTRACT", contractId);
  if (!info) {
    await renderPdf({ kind: "CONTRACT", refId: contractId });
    info = await getLatestPdf("CONTRACT", contractId);
  }
  if (!info) return null;
  const abs = path.isAbsolute(info.storageKey)
    ? info.storageKey
    : path.join(process.cwd(), info.storageKey);
  if (!fs.existsSync(abs)) return null;
  return fsp.readFile(abs);
}

async function appendPdfPages(
  out: PDFDocument,
  src: Buffer,
): Promise<void> {
  const srcDoc = await PDFDocument.load(src);
  const pages = await out.copyPages(srcDoc, srcDoc.getPageIndices());
  for (const page of pages) out.addPage(page);
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);

    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const technicianId = url.searchParams.get("technicianId");
    const langPair = parseLangPair(url.searchParams.get("langPair"));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError("Invalid or missing date");
    }
    if (!technicianId) {
      throw new ValidationError("Missing technicianId");
    }

    const { start, end } = startEndOfDay(date);

    const visits = await prisma.visit.findMany({
      where: {
        scheduledFor: { gte: start, lte: end },
        leadTechnicianId: technicianId,
        state: { in: ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] },
      },
      select: {
        id: true,
        type: true,
        scheduledFor: true,
        customerId: true,
        customer: { select: { type: true } },
      },
      orderBy: { scheduledFor: "asc" },
    });

    const customerIds = Array.from(new Set(visits.map((v) => v.customerId)));
    const contracts = customerIds.length
      ? await prisma.contract.findMany({
          where: {
            customerId: { in: customerIds },
            state: { in: ["ACTIVE", "PENDING_SIGNATURE", "AMENDED"] },
          },
          orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
          select: { id: true, customerId: true, type: true },
        })
      : [];
    const latestContract = new Map<
      string,
      { id: string; type: "RENTAL" | "SALE" | "MAINTENANCE" }
    >();
    for (const c of contracts) {
      if (!latestContract.has(c.customerId)) {
        latestContract.set(c.customerId, { id: c.id, type: c.type });
      }
    }

    registerFonts();
    const merged = await PDFDocument.create();

    for (const v of visits) {
      const contract = latestContract.get(v.customerId) ?? null;

      // INSTALLATION: prepend the contract PDF twice (customer + company).
      if (v.type === "INSTALLATION" && contract) {
        const contractPdf = await loadContractPdf(contract.id);
        if (contractPdf) {
          await appendPdfPages(merged, contractPdf);
          await appendPdfPages(merged, contractPdf);
        }
      }

      // Visit document — render fresh into memory.
      const kind = suggestVisitDocumentKind({
        visitType: v.type as VisitTypeForSuggest,
        customerType: v.customer.type as CustomerTypeForSuggest,
        contractType: contract?.type ?? null,
      });
      try {
        const element = await buildPreviewElement(v.id, kind, langPair);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docPdf = await renderToBuffer(element as any);
        await appendPdfPages(merged, Buffer.from(docPdf));
      } catch (err) {
        console.warn(
          `[print-bundle/pdf] skipped visit ${v.id} kind=${kind}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const mergedBytes = await merged.save();
    return new NextResponse(new Uint8Array(mergedBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bulk-print-${date}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
