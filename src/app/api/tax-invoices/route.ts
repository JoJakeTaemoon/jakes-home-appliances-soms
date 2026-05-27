/**
 * GET  /api/tax-invoices    — list (office STAFF+)
 * POST /api/tax-invoices    — UC-TI-01 multipart upload (MANAGER+)
 *
 * Multipart fields:
 *   - file:           the PDF buffer
 *   - paymentId:      string
 *   - invoiceNumber:  string
 *   - invoiceDate:    ISO date
 *   - notes?:         string
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  paginatedResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import {
  ForbiddenError,
  ValidationError,
} from "@/lib/api/error";
import {
  canIssueTaxInvoice,
  canViewPaymentList,
} from "@/lib/payments/access";
import {
  listTaxInvoiceQuerySchema,
  uploadTaxInvoiceMetaSchema,
} from "@/lib/validators/taxInvoice";
import { uploadTaxInvoice } from "@/lib/tax-invoices/operations";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canViewPaymentList(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }

    const url = new URL(request.url);
    const parsed = listTaxInvoiceQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      throw new ValidationError("Invalid query");
    }
    const { customerId, paymentId, from, to, page, pageSize } = parsed.data;

    const where: Prisma.TaxInvoiceWhereInput = {};
    if (paymentId) where.paymentId = paymentId;
    if (customerId) where.payment = { customerId };
    if (from || to) {
      where.invoiceDate = {};
      if (from) (where.invoiceDate as Prisma.DateTimeFilter).gte = from;
      if (to) (where.invoiceDate as Prisma.DateTimeFilter).lte = to;
    }

    const [total, rows] = await Promise.all([
      prisma.taxInvoice.count({ where }),
      prisma.taxInvoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          payment: {
            select: {
              id: true,
              actualAmount: true,
              customer: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
      }),
    ]);

    const enriched = rows.map((r) => ({
      ...r,
      payment: r.payment
        ? {
            ...r.payment,
            actualAmount: r.payment.actualAmount.toString(),
          }
        : null,
    }));

    return paginatedResponse(enriched, { page, limit: pageSize, total });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canIssueTaxInvoice(auth.role)) {
      throw new ForbiddenError("Only MANAGER+ can upload tax invoices");
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new ValidationError("multipart/form-data required");
    }
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      throw new ValidationError("Missing file");
    }
    const meta = uploadTaxInvoiceMetaSchema.safeParse({
      paymentId: formData.get("paymentId"),
      invoiceNumber: formData.get("invoiceNumber"),
      invoiceDate: formData.get("invoiceDate"),
      notes: formData.get("notes") ?? undefined,
    });
    if (!meta.success) {
      throw new ValidationError(
        "Invalid metadata",
        meta.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new ValidationError("PDF exceeds 10MB");
    }
    const filename =
      (file as unknown as { name?: string }).name ?? "tax-invoice.pdf";

    const result = await uploadTaxInvoice({
      paymentId: meta.data.paymentId,
      invoiceNumber: meta.data.invoiceNumber,
      invoiceDate: meta.data.invoiceDate,
      pdfBuffer: buffer,
      filename,
      notes: meta.data.notes,
      actorUserId: auth.userId,
    });
    return successResponse(result, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
