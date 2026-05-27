/**
 * GET /api/visits/recommend (UC-VS-01)
 *
 * Office-only. Returns ranked candidate technicians for a (customer, site?,
 * scheduledFor) tuple — used by the scheduling widget on the visit detail
 * page. Wraps `recommendTechnicians()`.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, ValidationError } from "@/lib/api/error";
import { isOfficeRole } from "@/lib/visits/access";
import { recommendQuerySchema } from "@/lib/validators/visit";
import { recommendTechnicians } from "@/lib/scheduler/recommend";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!isOfficeRole(auth.role)) {
      throw new ForbiddenError("Cannot use scheduler");
    }
    const url = new URL(request.url);
    const parsed = recommendQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid recommend query",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const out = await recommendTechnicians({
      customerId: parsed.data.customerId,
      siteId: parsed.data.siteId ?? null,
      scheduledFor: parsed.data.scheduledFor,
      maxResults: parsed.data.maxResults ?? 3,
    });
    return successResponse(out);
  } catch (err) {
    return toErrorResponse(err);
  }
}
