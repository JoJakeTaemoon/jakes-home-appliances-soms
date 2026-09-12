/**
 * GET /api/admin/notification-logs
 *   ?status=&channel=&templateCode=&q=&start=&end=&page=&pageSize=
 *
 * Delivery history for every SMS / email the system has dispatched, with the
 * provider verdict attached: `providerMessageId` on success, `errorMessage`
 * on failure (which carries the eSMS `CodeResult` and its meaning verbatim,
 * e.g. "eSMS CodeResult 146: CSKH template not registered ...").
 *
 * ADMIN + MANAGER only — rows expose customer phone numbers. Bodies of the
 * credential templates are withheld: the stored body holds the temporary
 * password verbatim, and it stays readable long after it was issued.
 *
 * Counting is left to the paginated `total`: filtering by status and reading
 * the row count is the same answer a separate tally query would give.
 */

import { z } from "zod";

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { CREDENTIAL_TEMPLATE_CODES } from "@/lib/notifications/templates";
import type { Prisma } from "@/generated/prisma/client";

const querySchema = z.object({
  status: z.enum(["QUEUED", "SENT", "FAILED", "MOCKED", "SKIPPED"]).optional(),
  channel: z.enum(["SMS", "EMAIL"]).optional(),
  templateCode: z.string().trim().max(60).optional(),
  q: z.string().trim().max(255).optional(),
  start: z.string().trim().max(40).optional(),
  end: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** `YYYY-MM-DD` is read as a VST wall-clock day; anything else must parse. */
function parseDay(raw: string | undefined, endOfDay: boolean): Date | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? "16:59:59.999" : "17:00:00.000"}Z`);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = defineQuery({
  audience: "staff",
  query: querySchema,
  paginated: true,
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
      throw new ForbiddenError("Insufficient role");
    }
  },
  handler: async ({ query }) => {
    const where: Prisma.NotificationLogWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.channel) where.channel = query.channel;
    if (query.templateCode) where.templateCode = query.templateCode;

    // `start` is inclusive from the beginning of that VST day, `end` runs to
    // the end of its VST day, so a single day filter returns that whole day.
    const from = parseDay(query.start, false);
    const to = parseDay(query.end, true);
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { recipient: { contains: query.q, mode: "insensitive" } },
        { templateCode: { contains: query.q, mode: "insensitive" } },
        { errorMessage: { contains: query.q, mode: "insensitive" } },
        { providerMessageId: { contains: query.q, mode: "insensitive" } },
        { customer: { name: { contains: query.q, mode: "insensitive" } } },
        { customer: { code: { contains: query.q, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.notificationLog.count({ where }),
      prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          createdAt: true,
          sentAt: true,
          templateCode: true,
          channel: true,
          locale: true,
          provider: true,
          recipient: true,
          status: true,
          providerMessageId: true,
          errorMessage: true,
          segmentsUsed: true,
          payload: true,
          customer: { select: { id: true, code: true, name: true } },
          contact: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      rows: rows.map((r) => {
        const payload = (r.payload ?? {}) as Record<string, unknown>;
        const body =
          typeof payload.body === "string" && !CREDENTIAL_TEMPLATE_CODES.has(r.templateCode)
            ? payload.body
            : null;
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          sentAt: r.sentAt?.toISOString() ?? null,
          templateCode: r.templateCode,
          channel: r.channel,
          locale: r.locale,
          provider: r.provider,
          recipient: r.recipient,
          status: r.status,
          providerMessageId: r.providerMessageId,
          errorMessage: r.errorMessage,
          segmentsUsed: r.segmentsUsed,
          subject: typeof payload.subject === "string" ? payload.subject : null,
          body,
          bodyRedacted:
            typeof payload.body === "string" && body === null,
          customerId: r.customer?.id ?? null,
          customerCode: r.customer?.code ?? null,
          customerName: r.customer?.name ?? null,
          contactName: r.contact?.name ?? null,
        };
      }),
      pagination: { page: query.page, limit: query.pageSize, total },
    };
  },
});
