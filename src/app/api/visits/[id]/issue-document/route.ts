/**
 * POST /api/visits/[id]/issue-document
 *
 * Track 3 — office STAFF+ issues a visit document. Enforces the D3
 * policy (visit must be SCHEDULED+ AND have a lead technician). Existing
 * same-kind documents are auto-archived by the renderer.
 *
 * Body: { kind: VisitDocumentKind, langPair?: "vi-ko" | "vi-en" }
 * Response: { documentId, kind, storageKey, sizeBytes, templateCode, reissued }
 */

import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { issueVisitDocument } from "@/lib/visits/issue-document";
import type { PdfKind } from "@/lib/pdf/renderer";
import { issueDocumentSchema } from "@/lib/validators/visit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const { id } = await ctx.params;

    const body = await request.json().catch(() => ({}));
    const parsed = issueDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid issue-document payload",
        parsed.error.issues.map((i) => ({
          path: i.path.filter(
            (p): p is string | number =>
              typeof p === "string" || typeof p === "number",
          ),
          message: i.message,
        })),
      );
    }
    const { kind, langPair, notes } = parsed.data;

    const result = await issueVisitDocument({
      visitId: id,
      kind: kind as PdfKind,
      langPair,
      notes,
      actorId: auth.userId,
      request,
    });

    return successResponse(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
