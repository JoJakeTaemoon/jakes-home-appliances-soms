/**
 * PDF render service.
 *
 *   renderContractPdf(contractId, locale) — fetches the Contract + Customer +
 *   Equipment via Prisma, picks the right template, renders to a Buffer,
 *   writes to `./uploads/contracts/{contractNumber}.pdf` (creating
 *   timestamped backup for any existing file), and writes the resulting
 *   Document row.
 *
 * Storage layout (Phase 3 local-disk; Phase 6 will move to Supabase Storage):
 *   uploads/
 *     contracts/
 *       <contractNumber>.pdf                     ← latest
 *       archive/
 *         <contractNumber>-<isoTs>.pdf           ← previous versions
 *
 * Returns `{ storageKey, sizeBytes, documentId }` so callers can stream or
 * link directly to the file.
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

export interface RenderResult {
  storageKey: string;
  sizeBytes: number;
  documentId: string;
  templateCode: string;
}

function getUploadsDir(): string {
  return path.join(process.cwd(), "uploads", "contracts");
}

function decimalToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadContractForPdf(contractId: string): Promise<{
  contract: PdfContractView;
  customer: PdfCustomerSummary;
  equipment: PdfEquipmentLine[];
  templateCode: string;
  meta: { contractNumber: string; customerId: string; raw: { type: "SALE" | "RENTAL" | "MAINTENANCE"; parentContractId: string | null } };
}> {
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

  return {
    contract,
    customer,
    equipment,
    templateCode,
    meta: {
      contractNumber: row.contractNumber,
      customerId: row.customer.id,
      raw: { type: row.type, parentContractId: row.parentContractId },
    },
  };
}

function pickTemplate(templateCode: string, props: PdfRenderProps) {
  switch (templateCode) {
    case "CONTRACT_APPENDIX_B2B":
      return React.createElement(AppendixContract, props);
    case "CONTRACT_MAINTENANCE":
      return React.createElement(MaintenanceContract, props);
    case "CONTRACT_B2B":
      return React.createElement(B2bContract, props);
    case "CONTRACT_B2C_RENTAL":
      return React.createElement(B2cRentalContract, props);
    case "CONTRACT_B2C_SALE":
    default:
      return React.createElement(B2cSaleContract, props);
  }
}

function safeFilename(contractNumber: string): string {
  // Replace `/` with `_` so the filesystem path is valid.
  return contractNumber.replace(/[\\/:*?"<>|]+/g, "_");
}

/**
 * Render the contract PDF to a Buffer (no DB write). Exposed for tests + the
 * streaming `GET /api/contracts/[id]/pdf` endpoint when re-rendering on the
 * fly is acceptable.
 */
export async function renderContractToBuffer(
  contractId: string,
  locale: PdfLocale,
): Promise<{ buffer: Buffer; templateCode: string; meta: { contractNumber: string; customerId: string } }> {
  registerFonts();
  const { contract, customer, equipment, templateCode, meta } = await loadContractForPdf(contractId);
  const element = pickTemplate(templateCode, {
    contract,
    customer,
    equipment,
    locale,
    generatedAt: new Date(),
  });
  // Cast: each template returns a <Document>, but `pickTemplate` is typed via
  // the union of template function components — `renderToBuffer` insists on
  // `ReactElement<DocumentProps>`, so we widen the prop type once here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  return { buffer, templateCode, meta: { contractNumber: meta.contractNumber, customerId: meta.customerId } };
}

/**
 * Render + persist. Writes the PDF to disk under `uploads/contracts/`,
 * archives any prior version, and creates a Document row.
 */
export async function renderContractPdf(
  contractId: string,
  locale: PdfLocale,
  options: { generatedById?: string | null } = {},
): Promise<RenderResult> {
  const { buffer, templateCode, meta } = await renderContractToBuffer(contractId, locale);

  const baseDir = getUploadsDir();
  await fsp.mkdir(baseDir, { recursive: true });
  await fsp.mkdir(path.join(baseDir, "archive"), { recursive: true });

  const filename = `${safeFilename(meta.contractNumber)}.pdf`;
  const fullPath = path.join(baseDir, filename);
  if (fs.existsSync(fullPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const archivePath = path.join(baseDir, "archive", `${safeFilename(meta.contractNumber)}-${ts}.pdf`);
    await fsp.rename(fullPath, archivePath);
  }
  await fsp.writeFile(fullPath, buffer);

  const storageKey = path.relative(process.cwd(), fullPath);

  const doc = await prisma.document.create({
    data: {
      kind: "CONTRACT",
      customerId: meta.customerId,
      contractId,
      templateCode,
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
    templateCode,
  };
}

/** Resolve the latest persisted PDF for a contract, or null if none exists yet. */
export async function getLatestContractPdf(contractId: string): Promise<{ storageKey: string; absolutePath: string; filename: string; sizeBytes: number | null } | null> {
  const doc = await prisma.document.findFirst({
    where: { contractId, kind: "CONTRACT" },
    orderBy: { generatedAt: "desc" },
  });
  if (!doc) return null;
  const abs = path.isAbsolute(doc.storageKey)
    ? doc.storageKey
    : path.join(process.cwd(), doc.storageKey);
  return {
    storageKey: doc.storageKey,
    absolutePath: abs,
    filename: doc.filename,
    sizeBytes: doc.sizeBytes,
  };
}
