/**
 * POST /api/mobile/visits/[id]/complete (UC-VS-06)
 *
 * Lead-only. Submit findings + parts + photos + signature + optional cash
 * collection. Transitions to COMPLETED, renders the work-confirmation PDF,
 * and queues EMAIL_VISIT_COMPLETED.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api/error";
import {
  canCompleteVisit,
  canTechnicianViewVisit,
} from "@/lib/visits/access";
import { completeVisitSchema } from "@/lib/validators/visit";
import { IllegalVisitTransitionError } from "@/lib/visits/state";
import { completeVisit } from "@/lib/visits/complete";
import { getVisitOr404 } from "@/lib/visits/queries";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
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
    if (!canCompleteVisit(auth, visit)) {
      throw new ForbiddenError(
        "Only the lead technician can complete the visit",
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = completeVisitSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid completion payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    // Locale resolution: customer's primary OPS contact language if known,
    // else "vi". Pull from the loaded customer.
    const lang =
      visit.customer.contacts.find((c) => c.isPrimary)?.language ??
      visit.customer.contacts[0]?.language ??
      "vi";

    try {
      const result = await completeVisit({
        visitId: id,
        actorUserId: auth.userId,
        input: parsed.data,
        locale: lang,
      });
      return successResponse(result);
    } catch (err) {
      if (err instanceof IllegalVisitTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
