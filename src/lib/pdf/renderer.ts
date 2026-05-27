/**
 * Unified PDF render facade.
 *
 * Single entry point for every PDF the system produces: contracts (5 template
 * variants), payment receipts, B2B tax invoices, and work-confirmation /
 * periodic-inspection slips. Centralises:
 *
 *   - Font registration (idempotent, once per process)
 *   - Storage-path layout (uploads/{kind-dir}/{filename}.pdf)
 *   - Archive-previous-version logic (any existing file is moved into
 *     `archive/{name}-{iso-timestamp}.pdf` before the new bytes land)
 *   - Template dispatch (CONTRACT inspects the row to pick one of 5 variants)
 *   - `Document` row creation (single point — every kind goes through here)
 *
 *   renderPdf({ kind, refId, locale })  → renders + persists + writes a
 *     Document row, returning the new storage key + doc id + size.
 *   getLatestPdf(kind, refId)           → returns the latest persisted PDF
 *     for a given (kind, refId) pair, or `null` if none exists yet.
 *
 * Replaces three earlier modules (`render.ts`, `payment-render.ts`,
 * `work-confirmation-render.ts`) which each duplicated the storage + archive
 * + Document-write logic.
 *
 * The actual template React components live unchanged under
 * `src/lib/pdf/templates/`; only the dispatch + persistence layer is unified.
 */

import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import prisma from "@/lib/prisma";
import { NotFoundError } from "@/lib/api/error";
import { registerFonts } from "@/lib/pdf/fonts";
import type {
  PdfContractView,
  PdfCustomerSummary,
  PdfEquipmentLine,
  PdfLocale,
  PdfRenderProps,
} from "@/lib/pdf/types";
import { B2cSaleContract } from "@/lib/pdf/templates/b2c-sale-contract";
import { B2cRentalContract } from "@/lib/pdf/templates/b2c-rental-contract";
import { B2bContract } from "@/lib/pdf/templates/b2b-contract";
import { MaintenanceContract } from "@/lib/pdf/templates/maintenance-contract";
import { AppendixContract } from "@/lib/pdf/templates/appendix";
import {
  Receipt,
  type ReceiptPayload,
} from "@/lib/pdf/templates/receipt";
import {
  TaxInvoiceTemplate,
  type TaxInvoicePayload,
} from "@/lib/pdf/templates/tax-invoice";
import {
  WorkConfirmation,
  type WorkConfPayload,
  type WorkConfPhoto,
} from "@/lib/pdf/templates/work-confirmation";

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type PdfKind =
  | "CONTRACT"
  | "RECEIPT"
  | "TAX_INVOICE"
  | "WORK_CONFIRMATION";

export interface RenderRequest {
  kind: PdfKind;
  /** contractId / paymentId / taxInvoiceId / visitId */
  refId: string;
  locale: PdfLocale;
  /** Tag the Document row with the staff user who triggered the render. */
  generatedById?: string | null;
}

export interface RenderResult {
  storageKey: string;
  sizeBytes: number;
  documentId: string;
  templateCode: string;
}

export interface LatestPdfInfo {
  storageKey: string;
  absolutePath: string;
  filename: string;
  sizeBytes: number | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function decimalToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

function decimalToNumberOrZero(v: unknown): number {
  return decimalToNumber(v) ?? 0;
}

function toAbsolutePath(storageKey: string): string {
  return path.isAbsolute(storageKey)
    ? storageKey
    : path.join(process.cwd(), storageKey);
}

function safePathSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_");
}

interface DirAndFilename {
  dir: string;
  filename: string;
}

/**
 * One place that knows where each kind's files live and how their filenames
 * are derived. Keeps the legacy on-disk layout intact (so already-rendered
 * files continue to resolve).
 */
function pathForKind(
  kind: PdfKind,
  ctx: {
    refId: string;
    contractNumber?: string;
    invoiceNumberOrId?: string;
  },
): DirAndFilename {
  switch (kind) {
    case "CONTRACT": {
      const dir = path.join(process.cwd(), "uploads", "contracts");
      const cn = ctx.contractNumber ?? ctx.refId;
      return { dir, filename: `${safePathSegment(cn)}.pdf` };
    }
    case "RECEIPT": {
      return {
        dir: path.join(process.cwd(), "uploads", "payments", ctx.refId),
        filename: "receipt.pdf",
      };
    }
    case "TAX_INVOICE": {
      const stem = (ctx.invoiceNumberOrId ?? `draft-${ctx.refId}`).replace(
        /[^A-Za-z0-9-_.]/g,
        "_",
      );
      return {
        dir: path.join(process.cwd(), "uploads", "tax-invoices", ctx.refId),
        filename: `${stem}.pdf`,
      };
    }
    case "WORK_CONFIRMATION": {
      return {
        dir: path.join(process.cwd(), "uploads", "visits", ctx.refId),
        filename: "work-confirmation.pdf",
      };
    }
  }
}

/**
 * Write `buffer` to `{dir}/{filename}`, archiving any prior file under
 * `{dir}/archive/{stem}-{iso}.{ext}`. Returns the relative storage key.
 */
async function persistWithArchive(
  dir: string,
  filename: string,
  buffer: Buffer,
  now: Date,
): Promise<string> {
  await fsp.mkdir(dir, { recursive: true });
  await fsp.mkdir(path.join(dir, "archive"), { recursive: true });

  const fullPath = path.join(dir, filename);
  if (fs.existsSync(fullPath)) {
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const ext = path.extname(filename);
    const stem = filename.slice(0, filename.length - ext.length);
    const archivePath = path.join(dir, "archive", `${stem}-${ts}${ext}`);
    await fsp.rename(fullPath, archivePath);
  }

  await fsp.writeFile(fullPath, buffer);
  return path.relative(process.cwd(), fullPath);
}

// ────────────────────────────────────────────────────────────────────────────
// CONTRACT — load + render
// ────────────────────────────────────────────────────────────────────────────

interface LoadedContract {
  element: React.ReactElement;
  templateCode: string;
  customerId: string;
  contractNumber: string;
}

async function loadContract(
  contractId: string,
  locale: PdfLocale,
): Promise<LoadedContract> {
  const row = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      parentContract: { select: { contractNumber: true } },
      customer: {
        include: {
          contacts: { where: { role: "CONTRACT_PARTY" }, take: 1 },
        },
      },
      equipment: {
        include: {
          equipment: {
            include: {
              model: true,
              site: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!row) throw new NotFoundError("Contract not found");

  const cp = row.customer.contacts[0];
  const customer: PdfCustomerSummary = {
    id: row.customer.id,
    code: row.customer.code,
    name: row.customer.name,
    type: row.customer.type,
    shortcode: row.customer.shortcode,
    taxCode: row.customer.taxCode,
    address: row.customer.address,
    district: row.customer.district,
    city: row.customer.city,
    contractParty: cp
      ? {
          name: cp.name,
          title: cp.title,
          phone: cp.phone1,
          email: cp.email,
          language: cp.language,
        }
      : null,
  };

  const contract: PdfContractView = {
    id: row.id,
    contractNumber: row.contractNumber,
    type: row.type,
    state: row.state,
    startDate: row.startDate,
    endDate: row.endDate,
    termMonths: row.termMonths,
    monthlyMaintenanceFee: decimalToNumber(row.monthlyMaintenanceFee),
    totalContractValue: decimalToNumber(row.totalContractValue),
    signedByCustomerAt: row.signedByCustomerAt,
    signedByCompanyAt: row.signedByCompanyAt,
    activatedAt: row.activatedAt,
    notes: null, // exclude internal notes from PDFs by default
    parentContractNumber: row.parentContract?.contractNumber ?? null,
    amendmentRevision: row.amendmentRevision,
    amendmentReason: row.amendmentReason,
  };

  const equipment: PdfEquipmentLine[] = row.equipment.map((ce) => ({
    equipmentId: ce.equipmentId,
    modelCode: ce.equipment.model.modelCode,
    modelName: ce.equipment.model.name,
    serialNumber: ce.equipment.serialNumber,
    siteName: ce.equipment.site?.name ?? null,
    unitPrice: decimalToNumber(ce.unitPrice),
    quantity: ce.quantity,
    notes: ce.notes,
  }));

  const isAmendment = !!row.parentContractId;
  let templateCode: string;
  if (isAmendment) templateCode = "CONTRACT_APPENDIX_B2B";
  else if (row.type === "MAINTENANCE") templateCode = "CONTRACT_MAINTENANCE";
  else if (row.customer.type === "B2B") templateCode = "CONTRACT_B2B";
  else if (row.type === "RENTAL") templateCode = "CONTRACT_B2C_RENTAL";
  else templateCode = "CONTRACT_B2C_SALE";

  const props: PdfRenderProps = {
    contract,
    customer,
    equipment,
    locale,
    generatedAt: new Date(),
  };

  let element: React.ReactElement;
  switch (templateCode) {
    case "CONTRACT_APPENDIX_B2B":
      element = React.createElement(AppendixContract, props);
      break;
    case "CONTRACT_MAINTENANCE":
      element = React.createElement(MaintenanceContract, props);
      break;
    case "CONTRACT_B2B":
      element = React.createElement(B2bContract, props);
      break;
    case "CONTRACT_B2C_RENTAL":
      element = React.createElement(B2cRentalContract, props);
      break;
    case "CONTRACT_B2C_SALE":
    default:
      element = React.createElement(B2cSaleContract, props);
      break;
  }

  return {
    element,
    templateCode,
    customerId: row.customer.id,
    contractNumber: row.contractNumber,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// RECEIPT — load + render
// ────────────────────────────────────────────────────────────────────────────

interface LoadedReceipt {
  element: React.ReactElement;
  templateCode: string;
  customerId: string;
  paymentId: string;
}

async function loadReceipt(
  paymentId: string,
  locale: PdfLocale,
): Promise<LoadedReceipt> {
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
    expectedAmount: decimalToNumberOrZero(payment.expectedAmount),
    actualAmount: decimalToNumberOrZero(payment.actualAmount),
    carryoverAmount: decimalToNumberOrZero(payment.carryoverAmount),
    reference: payment.reference ?? null,
    notes: payment.notes ?? null,
    locale,
    generatedAt: new Date(),
  };

  return {
    element: React.createElement(Receipt, { payload }),
    templateCode: "RECEIPT_V1",
    customerId: payment.customerId,
    paymentId: payment.id,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// TAX INVOICE — load + render
// ────────────────────────────────────────────────────────────────────────────

const VAT_RATE = 0.1;

interface LoadedTaxInvoice {
  element: React.ReactElement;
  templateCode: string;
  customerId: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumberOrId: string;
}

async function loadTaxInvoice(
  taxInvoiceId: string,
  locale: PdfLocale,
): Promise<LoadedTaxInvoice> {
  const inv = await prisma.taxInvoice.findUnique({
    where: { id: taxInvoiceId },
    include: {
      payment: {
        include: { customer: true },
      },
    },
  });
  if (!inv) throw new NotFoundError("TaxInvoice not found");

  const subtotal = decimalToNumberOrZero(inv.payment.actualAmount);
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

  return {
    element: React.createElement(TaxInvoiceTemplate, { payload }),
    templateCode: "TAX_INVOICE_RENDERED",
    customerId: inv.payment.customerId,
    paymentId: inv.paymentId,
    invoiceId: inv.id,
    invoiceNumberOrId: inv.invoiceNumber ?? `draft-${inv.id}`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// WORK CONFIRMATION — load + render
// ────────────────────────────────────────────────────────────────────────────

interface PhotoJsonEntry {
  storageKey?: string;
  url?: string;
  takenAt?: string;
}

function readPhotoArray(raw: unknown): WorkConfPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkConfPhoto[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as PhotoJsonEntry;
    const key = e.storageKey ?? e.url;
    if (!key) continue;
    out.push({
      storageKey: key,
      absolutePath: toAbsolutePath(key),
      takenAt: e.takenAt ? new Date(e.takenAt) : null,
    });
  }
  return out;
}

interface LoadedWorkConfirmation {
  element: React.ReactElement;
  templateCode: string;
  customerId: string;
  visitId: string;
  isPeriodic: boolean;
}

async function loadWorkConfirmation(
  visitId: string,
  locale: PdfLocale,
): Promise<LoadedWorkConfirmation> {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      customer: {
        include: {
          contacts: {
            where: { role: "OPS_CONTACT", isPrimary: true },
            take: 1,
          },
        },
      },
      equipment: { include: { model: true, site: { select: { name: true, address: true } } } },
      leadTechnician: { select: { id: true, username: true, phone: true } },
    },
  });
  if (!visit) throw new NotFoundError("Visit not found");

  let collaboratorNames: string[] = [];
  if (visit.collaboratorTechnicianIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: visit.collaboratorTechnicianIds } },
      select: { id: true, username: true },
    });
    const orderMap = new Map(users.map((u) => [u.id, u.username]));
    collaboratorNames = visit.collaboratorTechnicianIds
      .map((id) => orderMap.get(id))
      .filter((n): n is string => !!n);
  }

  let siteName: string | null = null;
  let siteAddress: string | null = null;
  if (visit.siteId) {
    const site = await prisma.site.findUnique({
      where: { id: visit.siteId },
      select: { name: true, address: true },
    });
    siteName = site?.name ?? null;
    siteAddress = site?.address ?? null;
  }
  if (!siteName && visit.equipment?.site) {
    siteName = visit.equipment.site.name;
    siteAddress = visit.equipment.site.address;
  }

  const customer = visit.customer;
  const contact = customer.contacts[0] ?? null;
  const address =
    siteAddress ??
    [customer.address, customer.district, customer.city]
      .filter(Boolean)
      .join(", ");

  const partsRaw = visit.partsReplaced;
  let partsReplaced: string[] = [];
  if (Array.isArray(partsRaw)) {
    partsReplaced = (partsRaw as unknown[])
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .slice(0, 50);
  }

  const photos = readPhotoArray(visit.photos);
  const signaturePhoto: WorkConfPhoto | null = visit.customerSignaturePhotoUrl
    ? {
        storageKey: visit.customerSignaturePhotoUrl,
        absolutePath: toAbsolutePath(visit.customerSignaturePhotoUrl),
        takenAt: null,
      }
    : null;

  const lead = visit.leadTechnician;
  const equipmentInfo = visit.equipment
    ? {
        modelCode: visit.equipment.model.modelCode,
        modelName: visit.equipment.model.name,
        serialNumber: visit.equipment.serialNumber,
      }
    : null;

  const basePayload: Omit<WorkConfPayload, "locale" | "generatedAt"> = {
    visitNumber: visit.id.slice(-12).toUpperCase(),
    visitType: visit.type,
    customerName: customer.name,
    customerCode: customer.code,
    customerType: customer.type,
    taxCode: customer.taxCode ?? null,
    siteName,
    address: address ?? "",
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone1 ?? null,
    scheduledFor: visit.scheduledFor,
    startedAt: visit.startedAt ?? null,
    completedAt: visit.completedAt ?? null,
    technicianName: lead?.username ?? "—",
    collaboratorNames,
    equipment: equipmentInfo,
    findings: visit.findings ?? "",
    partsReplaced,
    photos,
    signaturePhoto,
    collectedAmount: decimalToNumber(visit.expectedAmount),
    paymentMethod: null,
  };

  // Augment with actual payment captured on this visit if any.
  const payment = await prisma.payment.findFirst({
    where: { visitId: visit.id },
    orderBy: { collectedAt: "desc" },
    select: { actualAmount: true, method: true },
  });
  if (payment) {
    basePayload.collectedAmount = decimalToNumber(payment.actualAmount);
    basePayload.paymentMethod = payment.method;
  } else {
    basePayload.collectedAmount = null;
  }

  const isPeriodic = visit.type === "PERIODIC_INSPECTION";
  const templateCode = isPeriodic
    ? "WORK_CONFIRMATION_B2B_PERIODIC"
    : "WORK_CONFIRMATION_B2C";

  return {
    element: React.createElement(WorkConfirmation, {
      payload: { ...basePayload, locale, generatedAt: new Date() },
    }),
    templateCode,
    customerId: customer.id,
    visitId: visit.id,
    isPeriodic,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Document row writer
// ────────────────────────────────────────────────────────────────────────────

interface DocumentWriteInput {
  kind: PdfKind;
  /** Document-row scoping fields — only those relevant to this kind are set. */
  customerId: string;
  contractId?: string | null;
  paymentId?: string | null;
  visitId?: string | null;
  /** WORK_CONFIRMATION on PERIODIC_INSPECTION visits records a different Document.kind. */
  documentKindOverride?:
    | "CONTRACT"
    | "RECEIPT"
    | "TAX_INVOICE"
    | "WORK_CONFIRMATION"
    | "PERIODIC_INSPECTION";
  templateCode: string;
  locale: PdfLocale;
  storageKey: string;
  filename: string;
  sizeBytes: number;
  generatedById?: string | null;
}

async function writeDocumentRow(input: DocumentWriteInput): Promise<string> {
  const documentKind = input.documentKindOverride ?? input.kind;
  const doc = await prisma.document.create({
    data: {
      kind: documentKind,
      customerId: input.customerId,
      contractId: input.contractId ?? null,
      paymentId: input.paymentId ?? null,
      visitId: input.visitId ?? null,
      templateCode: input.templateCode,
      locale: input.locale,
      storageKey: input.storageKey,
      filename: input.filename,
      mimeType: "application/pdf",
      sizeBytes: input.sizeBytes,
      generatedById: input.generatedById ?? null,
    },
  });
  return doc.id;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API — renderPdf / getLatestPdf
// ────────────────────────────────────────────────────────────────────────────

/**
 * Render + persist a PDF for one of the supported kinds.
 *
 * Behaviour is identical to the previous kind-specific renderers
 * (`renderContractPdf` / `renderReceiptPdf` / `renderTaxInvoicePdf` /
 * `renderWorkConfirmationPdf`) so callers get byte-identical artifacts +
 * Document rows.
 */
export async function renderPdf(req: RenderRequest): Promise<RenderResult> {
  registerFonts();
  const now = new Date();

  switch (req.kind) {
    case "CONTRACT": {
      const loaded = await loadContract(req.refId, req.locale);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(loaded.element as any);
      const { dir, filename } = pathForKind("CONTRACT", {
        refId: req.refId,
        contractNumber: loaded.contractNumber,
      });
      const storageKey = await persistWithArchive(dir, filename, buffer, now);
      const documentId = await writeDocumentRow({
        kind: "CONTRACT",
        customerId: loaded.customerId,
        contractId: req.refId,
        templateCode: loaded.templateCode,
        locale: req.locale,
        storageKey,
        filename,
        sizeBytes: buffer.byteLength,
        generatedById: req.generatedById,
      });
      return {
        storageKey,
        sizeBytes: buffer.byteLength,
        documentId,
        templateCode: loaded.templateCode,
      };
    }

    case "RECEIPT": {
      const loaded = await loadReceipt(req.refId, req.locale);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(loaded.element as any);
      const { dir, filename } = pathForKind("RECEIPT", { refId: req.refId });
      const storageKey = await persistWithArchive(dir, filename, buffer, now);
      const documentId = await writeDocumentRow({
        kind: "RECEIPT",
        customerId: loaded.customerId,
        paymentId: loaded.paymentId,
        templateCode: loaded.templateCode,
        locale: req.locale,
        storageKey,
        filename,
        sizeBytes: buffer.byteLength,
        generatedById: req.generatedById,
      });
      return {
        storageKey,
        sizeBytes: buffer.byteLength,
        documentId,
        templateCode: loaded.templateCode,
      };
    }

    case "TAX_INVOICE": {
      const loaded = await loadTaxInvoice(req.refId, req.locale);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(loaded.element as any);
      const { dir, filename } = pathForKind("TAX_INVOICE", {
        refId: loaded.paymentId,
        invoiceNumberOrId: loaded.invoiceNumberOrId,
      });
      const storageKey = await persistWithArchive(dir, filename, buffer, now);
      const documentId = await writeDocumentRow({
        kind: "TAX_INVOICE",
        customerId: loaded.customerId,
        paymentId: loaded.paymentId,
        templateCode: loaded.templateCode,
        locale: req.locale,
        storageKey,
        filename,
        sizeBytes: buffer.byteLength,
        generatedById: req.generatedById,
      });
      // Stamp the rendered PDF key onto the TaxInvoice row so portal + admin
      // streams can resolve it without re-querying Document.
      await prisma.taxInvoice.update({
        where: { id: loaded.invoiceId },
        data: { pdfStorageKey: storageKey },
      });
      return {
        storageKey,
        sizeBytes: buffer.byteLength,
        documentId,
        templateCode: loaded.templateCode,
      };
    }

    case "WORK_CONFIRMATION": {
      const loaded = await loadWorkConfirmation(req.refId, req.locale);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(loaded.element as any);
      const { dir, filename } = pathForKind("WORK_CONFIRMATION", {
        refId: req.refId,
      });
      const storageKey = await persistWithArchive(dir, filename, buffer, now);
      const documentId = await writeDocumentRow({
        kind: "WORK_CONFIRMATION",
        customerId: loaded.customerId,
        visitId: loaded.visitId,
        documentKindOverride: loaded.isPeriodic
          ? "PERIODIC_INSPECTION"
          : "WORK_CONFIRMATION",
        templateCode: loaded.templateCode,
        locale: req.locale,
        storageKey,
        filename,
        sizeBytes: buffer.byteLength,
        generatedById: req.generatedById,
      });
      return {
        storageKey,
        sizeBytes: buffer.byteLength,
        documentId,
        templateCode: loaded.templateCode,
      };
    }
  }
}

/**
 * Resolve the latest persisted PDF for a given `(kind, refId)` pair.
 *
 * Returns `null` when no Document row exists yet — caller should typically
 * follow up with `renderPdf()` to materialise one.
 */
export async function getLatestPdf(
  kind: PdfKind,
  refId: string,
): Promise<LatestPdfInfo | null> {
  let doc: { storageKey: string; filename: string; sizeBytes: number | null } | null = null;

  switch (kind) {
    case "CONTRACT":
      doc = await prisma.document.findFirst({
        where: { contractId: refId, kind: "CONTRACT" },
        orderBy: { generatedAt: "desc" },
        select: { storageKey: true, filename: true, sizeBytes: true },
      });
      break;
    case "RECEIPT":
      doc = await prisma.document.findFirst({
        where: { paymentId: refId, kind: "RECEIPT" },
        orderBy: { generatedAt: "desc" },
        select: { storageKey: true, filename: true, sizeBytes: true },
      });
      break;
    case "TAX_INVOICE":
      doc = await prisma.document.findFirst({
        where: { paymentId: refId, kind: "TAX_INVOICE" },
        orderBy: { generatedAt: "desc" },
        select: { storageKey: true, filename: true, sizeBytes: true },
      });
      break;
    case "WORK_CONFIRMATION":
      doc = await prisma.document.findFirst({
        where: {
          visitId: refId,
          kind: { in: ["WORK_CONFIRMATION", "PERIODIC_INSPECTION"] },
        },
        orderBy: { generatedAt: "desc" },
        select: { storageKey: true, filename: true, sizeBytes: true },
      });
      break;
  }

  if (!doc) return null;
  return {
    storageKey: doc.storageKey,
    absolutePath: toAbsolutePath(doc.storageKey),
    filename: doc.filename,
    sizeBytes: doc.sizeBytes,
  };
}
