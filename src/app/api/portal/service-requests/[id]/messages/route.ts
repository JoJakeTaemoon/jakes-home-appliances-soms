/**
 * GET  /api/portal/service-requests/:id/messages  → conversation thread
 * POST /api/portal/service-requests/:id/messages  → customer posts a message
 *
 * Auth: portal customer; can only see/post on SRs belonging to their customer.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireCustomerAuth } from "@/lib/auth/customer-guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { appendSrMessage, listSrMessages } from "@/lib/service-requests/messages";

const postSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

async function ownsRequest(srId: string, customerId: string): Promise<{ id: string } | null> {
  return prisma.serviceRequest.findFirst({
    where: { id: srId, customerId },
    select: { id: true },
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireCustomerAuth(request);
    const { id } = await ctx.params;
    const sr = await ownsRequest(id, caller.customerId);
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
    const caller = await requireCustomerAuth(request);
    const { id } = await ctx.params;
    const sr = await ownsRequest(id, caller.customerId);
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
      author: "CUSTOMER",
      actorId: caller.contactId,
      authorName: caller.name ?? "Customer",
      request,
    });
    const messages = await listSrMessages(id);
    return successResponse({ messages });
  } catch (err) {
    return toErrorResponse(err);
  }
}
