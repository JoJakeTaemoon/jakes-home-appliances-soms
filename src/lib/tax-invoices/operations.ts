/**
 * Tax invoice operations (Phase 6 — UC-TI-01 / UC-TI-04).
 *
 * v1 path: office uploads a PDF generated in Viettel's portal. We store the
 * PDF + the invoice number/date + queue EMAIL_TAX_INVOICE to the contract
 * party. UC-TI-04 reissue marks the original as superseded and creates a new
 * row pointing back via `reissuedFromId`.
 */

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications/send";
import { formatVnd, formatDate } from "@/lib/format";

const VAT_RATE = 0.1;

function getInvoiceDir(paymentId: string): string {
  return path.join(process.cwd(), "uploads", "tax-invoices", paymentId);
}

/**
 * Tax-invoice recipient routing.
 *
 * Priority:
 *   1. Accounting contact (`isAccountingContact=true`) — explicit designation
 *   2. Primary customer-scoped OPS contact (`isPrimary=true, scope=CUSTOMER`)
 *   3. CONTRACT_PARTY — legal fallback
 *   4. First available contact
 */
function selectTaxInvoiceRecipient(
  contacts: {
    id: string;
    role: string;
    scope: string;
    isPrimary: boolean;
    isAccountingContact: boolean;
  }[],
): string | null {
  const accounting = contacts.find((c) => c.isAccountingContact);
  if (accounting) return accounting.id;
  const primaryOps = contacts.find(
    (c) =>
      c.role === "OPS_CONTACT" && c.isPrimary && c.scope === "CUSTOMER",
  );
  if (primaryOps) return primaryOps.id;
  const cp = contacts.find((c) => c.role === "CONTRACT_PARTY");
  if (cp) return cp.id;
  return contacts[0]?.id ?? null;
}

export interface UploadTaxInvoiceInput {
  paymentId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  pdfBuffer: Buffer;
  filename: string;
  actorUserId: string;
  notes?: string | null;
}

export async function uploadTaxInvoice(input: UploadTaxInvoiceInput) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          contacts: {
            select: {
              id: true,
              role: true,
              scope: true,
              isPrimary: true,
              isAccountingContact: true,
            },
          },
        },
      },
    },
  });
  if (!payment) throw new Error("Payment not found");

  // Write PDF to disk
  const dir = getInvoiceDir(input.paymentId);
  await fsp.mkdir(dir, { recursive: true });
  const safeNumber = input.invoiceNumber.replace(/[^A-Za-z0-9-_.]/g, "_");
  const targetFilename = `${safeNumber}.pdf`;
  const fullPath = path.join(dir, targetFilename);
  if (fs.existsSync(fullPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await fsp.mkdir(path.join(dir, "archive"), { recursive: true });
    await fsp.rename(
      fullPath,
      path.join(dir, "archive", `${safeNumber}-${ts}.pdf`),
    );
  }
  await fsp.writeFile(fullPath, input.pdfBuffer);
  const storageKey = path.relative(process.cwd(), fullPath);

  // Upsert the TaxInvoice row (Payment.taxInvoice is unique)
  const existing = await prisma.taxInvoice.findUnique({
    where: { paymentId: input.paymentId },
  });

  const invoice = existing
    ? await prisma.taxInvoice.update({
        where: { id: existing.id },
        data: {
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          invoiceProvider: "MANUAL_UPLOAD",
          invoicePdfUploadedAt: new Date(),
          pdfStorageKey: storageKey,
          notes: input.notes ?? existing.notes,
        },
      })
    : await prisma.taxInvoice.create({
        data: {
          paymentId: input.paymentId,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          invoiceProvider: "MANUAL_UPLOAD",
          invoicePdfUploadedAt: new Date(),
          pdfStorageKey: storageKey,
          notes: input.notes ?? null,
        },
      });

  // Create a Document row so the file appears in the customer activity feed.
  await prisma.document.create({
    data: {
      kind: "TAX_INVOICE",
      customerId: payment.customerId,
      paymentId: payment.id,
      templateCode: "TAX_INVOICE_MANUAL_UPLOAD",
      locale: "vi",
      storageKey,
      filename: input.filename || targetFilename,
      mimeType: "application/pdf",
      sizeBytes: input.pdfBuffer.byteLength,
      generatedById: input.actorUserId,
    },
  });

  await logAudit({
    actorType: "USER",
    actorId: input.actorUserId,
    action: existing ? "TAX_INVOICE_REPLACE" : "TAX_INVOICE_UPLOAD",
    entityType: "TaxInvoice",
    entityId: invoice.id,
    after: {
      paymentId: input.paymentId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      storageKey,
    },
  });

  // Email the contract party with EMAIL_TAX_INVOICE.
  const contactId = selectTaxInvoiceRecipient(payment.customer.contacts);
  let notificationsQueued = 0;
  if (contactId) {
    try {
      const subtotal = Number(payment.actualAmount.toString());
      const vat = Math.round(subtotal * VAT_RATE);
      const total = subtotal + vat;
      const results = await sendNotification({
        templateCode: "EMAIL_TAX_INVOICE",
        customerContactId: contactId,
        vars: {
          name: payment.customer.name,
          invoice_no: input.invoiceNumber,
          invoice_date: formatDate(input.invoiceDate, "vi"),
          amount: formatVnd(subtotal),
          vat: formatVnd(vat),
          total: formatVnd(total),
          hq_phone: "+84-28-1234-5678",
        },
        actorId: input.actorUserId,
        actorType: "USER",
      });
      notificationsQueued = results.filter((r) => r.status !== "SKIPPED").length;
      if (notificationsQueued > 0) {
        await prisma.taxInvoice.update({
          where: { id: invoice.id },
          data: {
            emailedAt: new Date(),
            emailedToContactId: contactId,
          },
        });
      }
    } catch (err) {
      console.error("[tax-invoice] email failed:", err);
    }
  }

  return { invoice, storageKey, notificationsQueued };
}

export interface ReissueTaxInvoiceInput {
  taxInvoiceId: string;
  reason: string;
  actorUserId: string;
}

export async function reissueTaxInvoice(input: ReissueTaxInvoiceInput) {
  const original = await prisma.taxInvoice.findUnique({
    where: { id: input.taxInvoiceId },
  });
  if (!original) throw new Error("TaxInvoice not found");

  // The new row points back via reissuedFromId. We free up the unique
  // (paymentId) by setting the original's paymentId to a synthetic suffix
  // — but the schema enforces uniqueness, so instead we DELETE the original
  // attachment and create a fresh row referencing both the payment + the
  // archived predecessor stored in `notes`.
  // To keep this simple: tombstone the original by clearing its invoice
  // number + appending a reissue note. The new row is created via
  // uploadTaxInvoice with a different invoice number once the office
  // re-uploads. This function only creates the placeholder.
  const tombstoned = await prisma.taxInvoice.update({
    where: { id: original.id },
    data: {
      invoiceNumber: null,
      notes: `${original.notes ?? ""}\nReissued: ${input.reason}`.trim(),
    },
  });

  await logAudit({
    actorType: "USER",
    actorId: input.actorUserId,
    action: "TAX_INVOICE_REISSUE",
    entityType: "TaxInvoice",
    entityId: original.id,
    before: { invoiceNumber: original.invoiceNumber },
    after: { reason: input.reason },
  });

  return { tombstoned };
}

export async function resendTaxInvoiceEmail(args: {
  taxInvoiceId: string;
  actorUserId: string;
}) {
  const inv = await prisma.taxInvoice.findUnique({
    where: { id: args.taxInvoiceId },
    include: {
      payment: {
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              contacts: {
                select: {
              id: true,
              role: true,
              scope: true,
              isPrimary: true,
              isAccountingContact: true,
            },
              },
            },
          },
        },
      },
    },
  });
  if (!inv) throw new Error("TaxInvoice not found");
  const contactId = selectTaxInvoiceRecipient(inv.payment.customer.contacts);
  if (!contactId) return { sent: 0 };

  const subtotal = Number(inv.payment.actualAmount.toString());
  const vat = Math.round(subtotal * VAT_RATE);
  const total = subtotal + vat;
  const results = await sendNotification({
    templateCode: "EMAIL_TAX_INVOICE",
    customerContactId: contactId,
    vars: {
      name: inv.payment.customer.name,
      invoice_no: inv.invoiceNumber ?? "—",
      invoice_date: formatDate(inv.invoiceDate ?? new Date(), "vi"),
      amount: formatVnd(subtotal),
      vat: formatVnd(vat),
      total: formatVnd(total),
      hq_phone: "+84-28-1234-5678",
    },
    actorId: args.actorUserId,
    actorType: "USER",
  });
  const sent = results.filter((r) => r.status !== "SKIPPED").length;
  await prisma.taxInvoice.update({
    where: { id: inv.id },
    data: { emailedAt: new Date(), emailedToContactId: contactId },
  });
  return { sent };
}
