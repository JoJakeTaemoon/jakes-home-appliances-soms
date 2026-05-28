/**
 * GET /api/visits/recommend (UC-VS-01)
 *
 * Office-only. Returns ranked candidate technicians for a (customer, site?,
 * scheduledFor) tuple — used by the scheduling widget on the visit detail
 * page. Wraps `recommendTechnicians()`.
 */

import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { VisitWorkflow } from "@/lib/visits/workflow";
import { recommendQuerySchema } from "@/lib/validators/visit";
import { recommendTechnicians } from "@/lib/scheduler/recommend";

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Cannot use scheduler");
    }
  },
  query: recommendQuerySchema,
  handler: ({ query }) =>
    recommendTechnicians({
      customerId: query.customerId,
      siteId: query.siteId ?? null,
      scheduledFor: query.scheduledFor,
      maxResults: query.maxResults ?? 3,
    }),
});
