/**
 * GET  /api/service-requests/:id/messages — office view of the thread
 * POST /api/service-requests/:id/messages — office posts a reply
 *
 * STAFF+ can read; MANAGER+ (or STAFF for now) can post replies.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

const paramsSchema = z.object({ id: z.string() });
const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

function assertOfficeRole(role: string) {
  if (role !== "ADMIN" && role !== "MANAGER" && role !== "STAFF") {
    throw new ForbiddenError("Insufficient role");
  }
}

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => assertOfficeRole(auth.role),
  params: paramsSchema,
  handler: async ({ params }) => {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!sr) throw new NotFoundError("Service request not found");
    return { messages: await ServiceRequestWorkflow.listMessages(params.id) };
  },
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => assertOfficeRole(auth.role),
  params: paramsSchema,
  body: postSchema,
  handler: async ({ auth, body, params, request }) => {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!sr) throw new NotFoundError("Service request not found");
    await ServiceRequestWorkflow.appendMessage({
      srId: params.id,
      body: body.body,
      author: "OFFICE",
      actorId: auth.userId,
      authorName: auth.email ?? auth.userId,
      request,
    });
    // Posting a reply implicitly clears the unread badge for the team.
    await prisma.serviceRequest.update({
      where: { id: params.id },
      data: { lastOfficeReadAt: new Date() },
    });
    return { messages: await ServiceRequestWorkflow.listMessages(params.id) };
  },
});
