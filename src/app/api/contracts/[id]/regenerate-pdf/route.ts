/**
 * POST /api/contracts/[id]/regenerate-pdf — re-render the contract PDF.
 *
 * Used after the Contract Party is edited (UC-CT-10 / customer detail page
 * warning), or any other content change that should reflect on a fresh PDF.
 *
 * MANAGER+ only. Returns the Document row.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { canRegenerateContractPdf } from "@/lib/contracts/access";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { renderContractPdf } from "@/lib/pdf/render";
import { logAudit } from "@/lib/audit";
import type { PdfLocale } from "@/lib/pdf/types";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (!canRegenerateContractPdf(auth.role)) {
      throw new ForbiddenError("Only managers can regenerate contract PDFs");
    }
    const { id } = await ctx.params;

    // Resolve locale from query (?locale=ko) or Contract Party language.
    const url = new URL(request.url);
    let locale: PdfLocale = "vi";
    const qLocale = url.searchParams.get("locale");
    if (qLocale === "ko" || qLocale === "vi" || qLocale === "en") {
      locale = qLocale;
    } else {
      const contract = await prisma.contract.findUnique({
        where: { id },
        select: {
          customer: {
            select: {
              contacts: {
                where: { role: "CONTRACT_PARTY" },
                take: 1,
                select: { language: true },
              },
            },
          },
        },
      });
      if (!contract) throw new NotFoundError("Contract not found");
      const lang = contract.customer.contacts[0]?.language;
      if (lang === "ko" || lang === "vi" || lang === "en") {
        locale = lang;
      }
    }

    const result = await renderContractPdf(id, locale, { generatedById: auth.userId });

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CONTRACT_PDF_REGENERATED",
      entityType: "Contract",
      entityId: id,
      after: {
        documentId: result.documentId,
        templateCode: result.templateCode,
        sizeBytes: result.sizeBytes,
        locale,
      },
      request,
    });

    return successResponse(result, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
