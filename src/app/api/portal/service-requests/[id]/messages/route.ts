/**
 * GET  /api/portal/service-requests/:id/messages  → conversation thread
 * POST /api/portal/service-requests/:id/messages  → customer posts a message
 *
 * Auth: portal customer; can only see/post on SRs belonging to their customer.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { NotFoundError } from "@/lib/api/error";
import { ServiceRequestWorkflow } from "@/lib/service-requests/workflow";

const paramsSchema = z.object({ id: z.string() });
const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

async function ownsRequest(
  srId: string,
  customerId: string,
): Promise<{ id: string } | null> {
  return prisma.serviceRequest.findFirst({
    where: { id: srId, customerId },
    select: { id: true },
  });
}

export const GET = defineQuery({
  audience: "customer",
  params: paramsSchema,
  handler: async ({ auth, params }) => {
    const sr = await ownsRequest(params.id, auth.customerId);
    if (!sr) throw new NotFoundError("Service request not found");
    return { messages: await ServiceRequestWorkflow.listMessages(params.id) };
  },
});

export const POST = defineMutation({
  audience: "customer",
  params: paramsSchema,
  body: postSchema,
  handler: async ({ auth, body, params, request }) => {
    const sr = await ownsRequest(params.id, auth.customerId);
    if (!sr) throw new NotFoundError("Service request not found");
    await ServiceRequestWorkflow.appendMessage({
      srId: params.id,
      body: body.body,
      author: "CUSTOMER",
      actorId: auth.contactId,
      authorName: auth.name ?? "Customer",
      request,
    });
    return { messages: await ServiceRequestWorkflow.listMessages(params.id) };
  },
});
