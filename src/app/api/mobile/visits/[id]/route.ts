/**
 * GET /api/mobile/visits/[id]
 *
 * TECHNICIAN-only. Detail view of a visit the technician participates in
 * (as lead OR collaborator). 404 otherwise (not 403 — opaque).
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import {
  canTechnicianViewVisit,
} from "@/lib/visits/access";
import { getVisitOr404, loadCollaborators } from "@/lib/visits/queries";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireAuth(request);
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
    const { id } = await ctx.params;
    const visit = await getVisitOr404(id);
    if (!canTechnicianViewVisit(auth, visit)) {
      throw new NotFoundError("Visit not found");
    }
    const collaborators = await loadCollaborators(visit.collaboratorTechnicianIds);
    return successResponse({ ...visit, collaborators });
  } catch (err) {
    return toErrorResponse(err);
  }
}
