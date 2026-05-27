/**
 * Payment + Tax Invoice PDF render services (Phase 6).
 *
 *   renderReceiptPdf(paymentId, locale)
 *   renderTaxInvoicePdf(taxInvoiceId, locale)
 *
 * Each fetches the row + customer info, renders to a Buffer, writes under
 * `./uploads/payments/{paymentId}/...` (or `./uploads/tax-invoices/{paymentId}/...`),
 * and writes a Document row referencing the customer + payment.
 */

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { NotFoundError } from "@/lib/api/error";
import { registerFonts } from "@/lib/pdf/fonts";
import {
  Receipt,
  type ReceiptLocale,
  type ReceiptPayload,
} from "@/lib/pdf/templates/receipt";
import {
  TaxInvoiceTemplate,
  type TaxInvoiceLocale,
  type TaxInvoicePayload,
} from "@/lib/pdf/templates/tax-invoice";

export interface PaymentPdfResult {
  storageKey: string;
  sizeBytes: number;
  documentId: string;
}

function decimalToNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

function getPaymentDir(paymentId: string): string {
  return path.join(process.cwd(), "uploads", "payments", paymentId);
}

function getTaxInvoiceDir(paymentId: string): string {
  return path.join(process.cwd(), "uploads", "tax-invoices", paymentId);
}

export async function renderReceiptPdf(
  paymentId: string,
  locale: ReceiptLocale,
  options: { generatedById?: string | null } = {},
): Promise<PaymentPdfResult> {
  registerFonts();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: {
        include: {
          contacts: {
            where: { role: "OPS_CONTACT", isPrimary: true },
            select: { name: true, phone1: true },
            take: 1,
          },
        },
      },
      collectedBy: { select: { username: true } },
    },
  });
  if (!payment) throw new NotFoundError("Payment not found");

  const contact = payment.customer.contacts[0] ?? null;
  const address =
    [payment.customer.address, payment.customer.district, payment.customer.city]
      .filter(Boolean)
      .join(", ");
  const collectorName = payment.collectedBy?.username ?? "—";

  const payload: ReceiptPayload = {
    receiptNumber: payment.id.slice(-12).toUpperCase(),
    paymentId: payment.id,
    customerName: payment.customer.name,
    customerCode: payment.customer.code,
    customerType: payment.customer.type as "B2C" | "B2B",
    taxCode: payment.customer.taxCode ?? null,
    address: address ?? "",
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone1 ?? null,
    collectedAt: payment.collectedAt ?? new Date(),
    collectorName,
    method: payment.method,
    expectedAmount: decimalToNumber(payment.expectedAmount),
    actualAmount: decimalToNumber(payment.actualAmount),
    carryoverAmount: decimalToNumber(payment.carryoverAmount),
    reference: payment.reference ?? null,
    notes: payment.notes ?? null,
    locale,
    generatedAt: new Date(),
  };

  const element = React.createElement(Receipt, { payload });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  const dir = getPaymentDir(paymentId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.mkdir(path.join(dir, "archive"), { recursive: true });

  const filename = "receipt.pdf";
  const fullPath = path.join(dir, filename);
  if (fs.existsSync(fullPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await fsp.rename(fullPath, path.join(dir, "archive", `receipt-${ts}.pdf`));
  }
  await fsp.writeFile(fullPath, buffer);
  const storageKey = path.relative(process.cwd(), fullPath);

  const doc = await prisma.document.create({
    data: {
      kind: "RECEIPT",
      customerId: payment.customerId,
      paymentId: payment.id,
      templateCode: "RECEIPT_V1",
      locale,
      storageKey,
      filename,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      generatedById: options.generatedById ?? null,
    },
  });

  return {
    storageKey,
    sizeBytes: buffer.byteLength,
    documentId: doc.id,
  };
}

const VAT_RATE = 0.1;

export async function renderTaxInvoicePdf(
  taxInvoiceId: string,
  locale: TaxInvoiceLocale,
  options: { generatedById?: string | null } = {},
): Promise<PaymentPdfResult> {
  registerFonts();
  const inv = await prisma.taxInvoice.findUnique({
    where: { id: taxInvoiceId },
    include: {
      payment: {
        include: { customer: true },
      },
    },
  });
  if (!inv) throw new NotFoundError("TaxInvoice not found");

  const subtotal = decimalToNumber(inv.payment.actualAmount);
  const vat = Math.round(subtotal * VAT_RATE);
  const total = subtotal + vat;
  const address = [
    inv.payment.customer.address,
    inv.payment.customer.district,
    inv.payment.customer.city,
  ]
    .filter(Boolean)
    .join(", ");

  const payload: TaxInvoicePayload = {
    invoiceNumber: inv.invoiceNumber ?? "(draft)",
    invoiceDate: inv.invoiceDate ?? new Date(),
    paymentId: inv.paymentId,
    customerName: inv.payment.customer.name,
    customerCode: inv.payment.customer.code,
    taxCode: inv.payment.customer.taxCode ?? null,
    address: address ?? "",
    subtotal,
    vatRate: VAT_RATE,
    vatAmount: vat,
    total,
    description:
      inv.notes ??
      `Payment ${inv.paymentId.slice(-12).toUpperCase()} — ${inv.payment.method}`,
    locale,
    generatedAt: new Date(),
  };

  const element = React.createElement(TaxInvoiceTemplate, { payload });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  const dir = getTaxInvoiceDir(inv.paymentId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.mkdir(path.join(dir, "archive"), { recursive: true });

  const filename = `${(inv.invoiceNumber ?? `draft-${inv.id}`).replace(/[^A-Za-z0-9-_.]/g, "_")}.pdf`;
  const fullPath = path.join(dir, filename);
  if (fs.existsSync(fullPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await fsp.rename(
      fullPath,
      path.join(dir, "archive", `${filename.replace(".pdf", "")}-${ts}.pdf`),
    );
  }
  await fsp.writeFile(fullPath, buffer);
  const storageKey = path.relative(process.cwd(), fullPath);

  const doc = await prisma.document.create({
    data: {
      kind: "TAX_INVOICE",
      customerId: inv.payment.customerId,
      paymentId: inv.paymentId,
      templateCode: "TAX_INVOICE_RENDERED",
      locale,
      storageKey,
      filename,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      generatedById: options.generatedById ?? null,
    },
  });

  await prisma.taxInvoice.update({
    where: { id: inv.id },
    data: { pdfStorageKey: storageKey },
  });

  return {
    storageKey,
    sizeBytes: buffer.byteLength,
    documentId: doc.id,
  };
}
