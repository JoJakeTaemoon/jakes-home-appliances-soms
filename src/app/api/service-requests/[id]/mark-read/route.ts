/**
 * POST /api/service-requests/:id/mark-read — office team marks the
 * customer thread as read.
 *
 * Stamps ServiceRequest.lastOfficeReadAt = now(). Any ADMIN/MANAGER/STAFF
 * user can mark on behalf of the team — the badge is team-wide, not
 * per-user. Posting a reply via /messages also implicitly catches up
 * the marker so the office user who just answered isn't told they
 * still have unread.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

function assertOfficeRole(role: string) {
  if (role !== "ADMIN" && role !== "MANAGER" && role !== "STAFF") {
    throw new ForbiddenError("Insufficient role");
  }
}

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => assertOfficeRole(auth.role),
  params: paramsSchema,
  body: z.object({}).optional(),
  handler: async ({ params }) => {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!sr) throw new NotFoundError("Service request not found");
    const updated = await prisma.serviceRequest.update({
      where: { id: params.id },
      data: { lastOfficeReadAt: new Date() },
      select: { id: true, lastOfficeReadAt: true },
    });
    return updated;
  },
});
