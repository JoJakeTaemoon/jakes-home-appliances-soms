/**
 * Work Confirmation PDF render service.
 *
 *   renderWorkConfirmationPdf(visitId, locale) — loads the Visit + Customer +
 *   Equipment + Technician via Prisma, renders the WorkConfirmation template
 *   to a Buffer, writes it under `./uploads/visits/{visitId}/work-confirmation.pdf`,
 *   archives any prior version, and creates a Document row with kind
 *   WORK_CONFIRMATION (B2C) or PERIODIC_INSPECTION (B2B periodic visit).
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
  WorkConfirmation,
  type WorkConfLocale,
  type WorkConfPayload,
  type WorkConfPhoto,
} from "@/lib/pdf/templates/work-confirmation";

export interface WorkConfRenderResult {
  storageKey: string;
  sizeBytes: number;
  documentId: string;
  templateCode: string;
}

function getVisitUploadDir(visitId: string): string {
  return path.join(process.cwd(), "uploads", "visits", visitId);
}

function toAbsolutePath(storageKey: string): string {
  return path.isAbsolute(storageKey)
    ? storageKey
    : path.join(process.cwd(), storageKey);
}

function decimalToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

async function loadVisitForPdf(visitId: string): Promise<{
  payload: Omit<WorkConfPayload, "locale" | "generatedAt">;
  customerId: string;
  visitType: string;
  isPeriodic: boolean;
}> {
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

  const payload: Omit<WorkConfPayload, "locale" | "generatedAt"> = {
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
    collectedAmount: decimalToNumber(visit.expectedAmount), // overwritten with payment if present
    paymentMethod: null,
  };

  // Augment with actual payment captured on this visit if any.
  const payment = await prisma.payment.findFirst({
    where: { visitId: visit.id },
    orderBy: { collectedAt: "desc" },
    select: { actualAmount: true, method: true },
  });
  if (payment) {
    payload.collectedAmount = decimalToNumber(payment.actualAmount);
    payload.paymentMethod = payment.method;
  } else {
    payload.collectedAmount = null;
  }

  return {
    payload,
    customerId: customer.id,
    visitType: visit.type,
    isPeriodic: visit.type === "PERIODIC_INSPECTION",
  };
}

export async function renderWorkConfirmationPdf(
  visitId: string,
  locale: WorkConfLocale,
  options: { generatedById?: string | null } = {},
): Promise<WorkConfRenderResult> {
  registerFonts();
  const { payload, customerId, isPeriodic } = await loadVisitForPdf(visitId);
  const generatedAt = new Date();

  const element = React.createElement(WorkConfirmation, {
    payload: { ...payload, locale, generatedAt },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  const dir = getVisitUploadDir(visitId);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.mkdir(path.join(dir, "archive"), { recursive: true });

  const filename = "work-confirmation.pdf";
  const fullPath = path.join(dir, filename);
  if (fs.existsSync(fullPath)) {
    const ts = generatedAt.toISOString().replace(/[:.]/g, "-");
    const archivePath = path.join(dir, "archive", `work-confirmation-${ts}.pdf`);
    await fsp.rename(fullPath, archivePath);
  }
  await fsp.writeFile(fullPath, buffer);
  const storageKey = path.relative(process.cwd(), fullPath);

  const templateCode = isPeriodic
    ? "WORK_CONFIRMATION_B2B_PERIODIC"
    : "WORK_CONFIRMATION_B2C";

  const doc = await prisma.document.create({
    data: {
      kind: isPeriodic ? "PERIODIC_INSPECTION" : "WORK_CONFIRMATION",
      customerId,
      visitId,
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

/** Resolve latest persisted work-confirmation PDF for a visit. */
export async function getLatestWorkConfirmationPdf(
  visitId: string,
): Promise<{
  storageKey: string;
  absolutePath: string;
  filename: string;
  sizeBytes: number | null;
} | null> {
  const doc = await prisma.document.findFirst({
    where: {
      visitId,
      kind: { in: ["WORK_CONFIRMATION", "PERIODIC_INSPECTION"] },
    },
    orderBy: { generatedAt: "desc" },
  });
  if (!doc) return null;
  return {
    storageKey: doc.storageKey,
    absolutePath: toAbsolutePath(doc.storageKey),
    filename: doc.filename,
    sizeBytes: doc.sizeBytes,
  };
}
