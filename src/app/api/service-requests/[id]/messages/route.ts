/**
 * GET  /api/service-requests/:id/messages — office view of the thread
 * POST /api/service-requests/:id/messages — office posts a reply
 *
 * STAFF+ can read; MANAGER+ (or STAFF for now) can post replies.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { appendSrMessage, listSrMessages } from "@/lib/service-requests/messages";

const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const { id } = await ctx.params;
    const sr = await prisma.serviceRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!sr) throw new NotFoundError("Service request not found");
    const messages = await listSrMessages(id);
    return successResponse({ messages });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireRole(request, ["ADMIN", "MANAGER", "STAFF"]);
    const { id } = await ctx.params;
    const sr = await prisma.serviceRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!sr) throw new NotFoundError("Service request not found");
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid input",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    await appendSrMessage({
      srId: id,
      body: parsed.data.body,
      author: "OFFICE",
      actorId: caller.userId,
      authorName: caller.email ?? caller.userId,
      request,
    });
    const messages = await listSrMessages(id);
    return successResponse({ messages });
  } catch (err) {
    return toErrorResponse(err);
  }
}
