/**
 * Visit-document preview loader.
 *
 * Given a `visitId` + `kind`, fetches the Visit + related rows (customer,
 * site, equipment, contract, consumable logs) and returns a React element
 * ready for `@react-pdf/renderer`'s `renderToBuffer`. Used by the
 * sample-first preview route at `GET /api/visits/[id]/preview/[kind]`.
 *
 * This is the loading half only — no disk persistence, no Document row
 * write. The Track 3 production "issue document" flow will reuse these
 * builders through `renderer.ts`'s dispatch.
 */

import React from "react";
import prisma from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/api/error";
import { getHqPhone } from "@/lib/settings";
import {
  DeliveryReceipt,
  type DeliveryReceiptPayload,
} from "@/lib/pdf/templates/delivery-receipt";
import {
  SaleReceiptB2C,
  type SaleReceiptPayload,
} from "@/lib/pdf/templates/sale-receipt-b2c";
import {
  DeliverySlipB2B,
  type DeliverySlipB2bPayload,
} from "@/lib/pdf/templates/delivery-slip-b2b";
import {
  PeriodicCheckB2C,
  type PeriodicCheckB2cPayload,
} from "@/lib/pdf/templates/periodic-check-b2c";
import {
  PeriodicCheckB2B,
  type PeriodicCheckB2bPayload,
} from "@/lib/pdf/templates/periodic-check-b2b";
import {
  WorkConfirmation,
  type WorkConfPayload,
} from "@/lib/pdf/templates/work-confirmation";
import type { PdfLangPair } from "@/lib/pdf/types";

/** Preview-capable kinds. WORK_CONFIRMATION is the legacy entry. */
export const PREVIEW_KINDS = [
  "DELIVERY_RECEIPT",
  "SALE_RECEIPT_B2C",
  "DELIVERY_SLIP_B2B",
  "PERIODIC_CHECK_B2C",
  "PERIODIC_CHECK_B2B",
  "WORK_CONFIRMATION",
] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

export function isPreviewKind(s: string): s is PreviewKind {
  return (PREVIEW_KINDS as readonly string[]).includes(s);
}

function visitNumber(visitId: string): string {
  return visitId.slice(-12).toUpperCase();
}

function shortNumber(visitId: string): string {
  return visitId.slice(-8).toUpperCase();
}

function decToNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  // Prisma Decimal exposes toString(); fall back to numeric coercion only
  // when the runtime object actually has one.
  if (typeof (v as { toString?: () => string }).toString === "function") {
    const n = Number((v as { toString: () => string }).toString());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface FetchedVisit {
  visitId: string;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  type: string;
  state: string;
  findings: string | null;
  partsReplaced: unknown;
  customerSignaturePhotoUrl: string | null;
  customer: {
    id: string;
    code: string;
    name: string;
    type: "B2C" | "B2B";
    address: string | null;
    district: string | null;
    city: string | null;
    taxCode: string | null;
    contactName: string | null;
    contactTitle: string | null;
    contactPhone: string | null;
  };
  site: { id: string; name: string; address: string | null } | null;
  equipment: {
    id: string;
    modelCode: string;
    modelName: string;
    serialNumber: string | null;
  } | null;
  technicianName: string;
  collaboratorNames: string[];
}

async function fetchVisit(visitId: string): Promise<FetchedVisit> {
  const v = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      customer: {
        include: {
          contacts: {
            where: { role: "CONTRACT_PARTY" },
            orderBy: { isPrimary: "desc" },
            take: 1,
          },
        },
      },
      equipment: { include: { model: true } },
      leadTechnician: { select: { id: true, username: true } },
    },
  });
  if (!v) throw new NotFoundError("Visit not found");

  let site: { id: string; name: string; address: string | null } | null = null;
  if (v.siteId) {
    const s = await prisma.site.findUnique({
      where: { id: v.siteId },
      select: { id: true, name: true, address: true },
    });
    site = s
      ? { id: s.id, name: s.name, address: s.address }
      : null;
  }

  let collaboratorNames: string[] = [];
  if (v.collaboratorTechnicianIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: v.collaboratorTechnicianIds } },
      select: { id: true, username: true },
    });
    const m = new Map(users.map((u) => [u.id, u.username]));
    collaboratorNames = v.collaboratorTechnicianIds
      .map((id) => m.get(id))
      .filter((n): n is string => !!n);
  }

  const c = v.customer;
  const contact = c.contacts[0] ?? null;
  const eq = v.equipment;
  const eqModel = eq?.model ?? null;
  const eqFallback = eq?.customDescription ?? "";
  const modelName = eq
    ? eqModel
      ? eqModel.nameVi ?? eqModel.nameKo ?? eqModel.nameEn ?? eqModel.modelCode ?? ""
      : eqFallback
    : "";

  return {
    visitId: v.id,
    scheduledFor: v.scheduledFor,
    startedAt: v.startedAt,
    completedAt: v.completedAt,
    type: v.type,
    state: v.state,
    findings: v.findings,
    partsReplaced: v.partsReplaced,
    customerSignaturePhotoUrl: v.customerSignaturePhotoUrl,
    customer: {
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type as "B2C" | "B2B",
      address: c.address,
      district: c.district,
      city: c.city,
      taxCode: c.taxCode,
      contactName: contact?.name ?? null,
      contactTitle: contact?.title ?? null,
      contactPhone: contact?.phone1 ?? null,
    },
    site,
    equipment: eq
      ? {
          id: eq.id,
          modelCode: eqModel?.modelCode ?? modelName,
          modelName,
          serialNumber: eq.serialNumber,
        }
      : null,
    technicianName: v.leadTechnician?.username ?? "—",
    collaboratorNames,
  };
}

function joinAddress(c: FetchedVisit["customer"]): string {
  return [c.address, c.district, c.city].filter(Boolean).join(", ");
}

async function pickContract(
  customerId: string,
  type: "RENTAL" | "SALE" | "MAINTENANCE" | null,
): Promise<{
  id: string;
  contractNumber: string;
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  startDate: Date | null;
  endDate: Date | null;
  monthlyFee: number | null;
  lines: Array<{
    equipmentId: string;
    modelCode: string;
    modelName: string;
    serialNumber: string | null;
    unitPrice: number | null;
    quantity: number;
  }>;
} | null> {
  const row = await prisma.contract.findFirst({
    where: {
      customerId,
      ...(type ? { type } : {}),
      state: { in: ["ACTIVE", "PENDING_SIGNATURE", "AMENDED"] },
    },
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      equipment: {
        include: {
          equipment: { include: { model: true } },
        },
      },
    },
  });
  if (!row) return null;
  const lines = row.equipment.map((ce) => {
    const m = ce.equipment.model;
    const fallback = ce.equipment.customDescription ?? "";
    const name = m
      ? m.nameVi ?? m.nameKo ?? m.nameEn ?? m.modelCode ?? ""
      : fallback;
    return {
      equipmentId: ce.equipmentId,
      modelCode: m?.modelCode ?? name,
      modelName: name,
      serialNumber: ce.equipment.serialNumber,
      unitPrice: decToNum(ce.unitPrice),
      quantity: ce.quantity,
    };
  });
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    type: row.type,
    startDate: row.startDate,
    endDate: row.endDate,
    monthlyFee: decToNum(row.monthlyMaintenanceFee),
    lines,
  };
}

async function buildDeliveryReceipt(
  v: FetchedVisit,
  langPair: PdfLangPair,
): Promise<DeliveryReceiptPayload> {
  if (v.customer.type !== "B2C") {
    throw new ValidationError(
      "DELIVERY_RECEIPT is a B2C-rental document — visit's customer is B2B",
    );
  }
  const contract = await pickContract(v.customer.id, "RENTAL");
  const hqPhone = await getHqPhone();
  let equipment: DeliveryReceiptPayload["equipment"] = [];
  if (contract?.lines.length) {
    equipment = contract.lines.map((l) => ({
      modelCode: l.modelCode,
      modelName: l.modelName,
      serialNumber: l.serialNumber,
    }));
  } else if (v.equipment) {
    equipment = [
      {
        modelCode: v.equipment.modelCode,
        modelName: v.equipment.modelName,
        serialNumber: v.equipment.serialNumber,
      },
    ];
  }
  return {
    visitNumber: shortNumber(v.visitId),
    contractNumber: contract?.contractNumber ?? "—",
    customerName: v.customer.name,
    customerCode: v.customer.code,
    address: joinAddress(v.customer),
    contactName: v.customer.contactName,
    contactPhone: v.customer.contactPhone,
    installedAt: v.scheduledFor,
    technicianName: v.technicianName,
    equipment,
    notes: v.findings,
    hqPhone,
    langPair,
    generatedAt: new Date(),
  };
}

async function buildSaleReceiptB2c(
  v: FetchedVisit,
  langPair: PdfLangPair,
): Promise<SaleReceiptPayload> {
  if (v.customer.type !== "B2C") {
    throw new ValidationError(
      "SALE_RECEIPT_B2C requires a B2C customer",
    );
  }
  const contract = await pickContract(v.customer.id, "SALE");
  const hqPhone = await getHqPhone();
  let lines: SaleReceiptPayload["lines"] = [];
  if (contract?.lines.length) {
    lines = contract.lines.map((l) => ({
      modelCode: l.modelCode,
      modelName: l.modelName,
      serialNumber: l.serialNumber,
      unitPrice: l.unitPrice ?? 0,
      quantity: l.quantity,
    }));
  } else if (v.equipment) {
    lines = [
      {
        modelCode: v.equipment.modelCode,
        modelName: v.equipment.modelName,
        serialNumber: v.equipment.serialNumber,
        unitPrice: 0,
        quantity: 1,
      },
    ];
  }
  return {
    receiptNumber: visitNumber(v.visitId),
    visitNumber: shortNumber(v.visitId),
    contractNumber: contract?.contractNumber ?? null,
    customerName: v.customer.name,
    customerCode: v.customer.code,
    address: joinAddress(v.customer),
    contactName: v.customer.contactName,
    contactPhone: v.customer.contactPhone,
    saleDate: v.scheduledFor,
    technicianName: v.technicianName,
    lines,
    paymentMethod: "CASH",
    notes: v.findings,
    hqPhone,
    langPair,
    generatedAt: new Date(),
  };
}

async function buildDeliverySlipB2b(
  v: FetchedVisit,
  langPair: PdfLangPair,
): Promise<DeliverySlipB2bPayload> {
  if (v.customer.type !== "B2B") {
    throw new ValidationError(
      "DELIVERY_SLIP_B2B requires a B2B customer",
    );
  }
  const contract = await pickContract(v.customer.id, null);
  const hqPhone = await getHqPhone();
  let lines: DeliverySlipB2bPayload["lines"] = [];
  if (contract?.lines.length) {
    lines = contract.lines.map((l) => ({
      modelCode: l.modelCode,
      modelName: l.modelName,
      serialNumber: l.serialNumber,
      unit: "Cái",
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    }));
  } else if (v.equipment) {
    lines = [
      {
        modelCode: v.equipment.modelCode,
        modelName: v.equipment.modelName,
        serialNumber: v.equipment.serialNumber,
        unit: "Cái",
        quantity: 1,
        unitPrice: null,
      },
    ];
  }
  return {
    slipNumber: shortNumber(v.visitId),
    visitNumber: shortNumber(v.visitId),
    contractNumber: contract?.contractNumber ?? null,
    customerName: v.customer.name,
    customerCode: v.customer.code,
    customerTaxCode: v.customer.taxCode,
    customerAddress: joinAddress(v.customer),
    siteName: v.site?.name ?? null,
    siteAddress: v.site?.address ?? null,
    recipientName: v.customer.contactName ?? v.customer.name,
    recipientTitle: v.customer.contactTitle,
    deliveryDate: v.scheduledFor,
    technicianName: v.technicianName,
    reason: "Giao thiết bị theo hợp đồng",
    warehouse: "Kho TP. HCM",
    lines,
    notes: v.findings,
    hqPhone,
    langPair,
    generatedAt: new Date(),
  };
}

async function buildPeriodicCheckB2c(
  v: FetchedVisit,
  langPair: PdfLangPair,
): Promise<PeriodicCheckB2cPayload> {
  if (v.customer.type !== "B2C") {
    throw new ValidationError(
      "PERIODIC_CHECK_B2C requires a B2C customer",
    );
  }
  if (!v.equipment) {
    throw new ValidationError(
      "PERIODIC_CHECK_B2C requires a visit with equipment attached",
    );
  }
  const contract = await pickContract(v.customer.id, null);
  const hqPhone = await getHqPhone();
  const logs = await prisma.visitConsumableLog.findMany({
    where: { visitId: v.visitId },
    include: { consumable: true },
    orderBy: { createdAt: "asc" },
  });
  const tasks = logs.map((l) => ({
    consumableSku: l.consumable.sku,
    consumableName:
      l.consumable.nameVi ?? l.consumable.nameKo ?? l.consumable.nameEn,
    action: l.action,
    notes: l.notes,
  }));
  const charges =
    contract?.type === "RENTAL" && contract.monthlyFee !== null
      ? [
          {
            description: "Phí thuê tháng / 월 임대료",
            quantity: 1,
            unitPrice: contract.monthlyFee,
          },
        ]
      : [];
  return {
    visitNumber: shortNumber(v.visitId),
    customerName: v.customer.name,
    customerCode: v.customer.code,
    address: joinAddress(v.customer),
    contactName: v.customer.contactName,
    contactPhone: v.customer.contactPhone,
    visitDate: v.scheduledFor,
    technicianName: v.technicianName,
    equipmentModelCode: v.equipment.modelCode,
    equipmentModelName: v.equipment.modelName,
    equipmentSerial: v.equipment.serialNumber,
    contractType: contract?.type ?? null,
    monthlyFee: contract?.monthlyFee ?? null,
    tasks,
    charges,
    outstandingCarryover: 0,
    notes: v.findings,
    hqPhone,
    langPair,
    generatedAt: new Date(),
  };
}

async function buildPeriodicCheckB2b(
  v: FetchedVisit,
  langPair: PdfLangPair,
): Promise<PeriodicCheckB2bPayload> {
  if (v.customer.type !== "B2B") {
    throw new ValidationError(
      "PERIODIC_CHECK_B2B requires a B2B customer",
    );
  }
  const hqPhone = await getHqPhone();
  // Pull all active equipment for the customer (optionally filtered to the
  // visit's site). The sample inspection covers every unit at the site —
  // matches the §7 paper form which lists all devices.
  const equipmentRows = await prisma.equipment.findMany({
    where: {
      customerId: v.customer.id,
      ...(v.site ? { siteId: v.site.id } : {}),
      status: "ACTIVE",
    },
    include: { model: true, site: { select: { name: true } } },
    orderBy: { installedAt: "asc" },
  });
  const equipment = equipmentRows.map((e) => {
    const m = e.model;
    const fallback = e.customDescription ?? "";
    const name = m
      ? m.nameVi ?? m.nameKo ?? m.nameEn ?? m.modelCode ?? ""
      : fallback;
    return {
      modelCode: m?.modelCode ?? name,
      modelName: name,
      serialNumber: e.serialNumber,
      location: e.site?.name ?? v.site?.name ?? null,
      workSummary: "Vệ sinh định kỳ + kiểm tra hoạt động",
      notes: null,
    };
  });
  return {
    visitNumber: shortNumber(v.visitId),
    customerName: v.customer.name,
    customerCode: v.customer.code,
    customerTaxCode: v.customer.taxCode,
    customerAddress: joinAddress(v.customer),
    siteName: v.site?.name ?? null,
    siteAddress: v.site?.address ?? null,
    recipientName: v.customer.contactName,
    recipientTitle: v.customer.contactTitle,
    visitDate: v.scheduledFor,
    technicianName: v.technicianName,
    collaboratorNames: v.collaboratorNames,
    equipment,
    generalNotes: v.findings,
    hqPhone,
    langPair,
    generatedAt: new Date(),
  };
}

async function buildWorkConfirmation(
  v: FetchedVisit,
  langPair: PdfLangPair,
): Promise<WorkConfPayload> {
  let parts: string[] = [];
  if (Array.isArray(v.partsReplaced)) {
    parts = (v.partsReplaced as unknown[])
      .filter((p): p is string => typeof p === "string" && p.length > 0)
      .slice(0, 50);
  }
  return {
    visitNumber: visitNumber(v.visitId),
    visitType: v.type,
    customerName: v.customer.name,
    customerCode: v.customer.code,
    customerType: v.customer.type,
    taxCode: v.customer.taxCode,
    siteName: v.site?.name ?? null,
    address: v.site?.address ?? joinAddress(v.customer),
    contactName: v.customer.contactName,
    contactPhone: v.customer.contactPhone,
    scheduledFor: v.scheduledFor,
    startedAt: v.startedAt,
    completedAt: v.completedAt,
    technicianName: v.technicianName,
    collaboratorNames: v.collaboratorNames,
    equipment: v.equipment
      ? {
          modelCode: v.equipment.modelCode,
          modelName: v.equipment.modelName,
          serialNumber: v.equipment.serialNumber,
        }
      : null,
    findings: v.findings ?? "",
    partsReplaced: parts,
    photos: [],
    signaturePhoto: null,
    collectedAmount: null,
    paymentMethod: null,
    langPair,
    generatedAt: new Date(),
  };
}

/**
 * Discriminated union of (kind, payload) — used by the print-bundle API
 * + the matching HTML print components in the visits/print page. Both
 * the PDF templates and the HTML print components consume the same
 * payload shape, so this is the canonical data contract.
 */
export type VisitDocumentPayload =
  | { kind: "DELIVERY_RECEIPT"; payload: DeliveryReceiptPayload }
  | { kind: "SALE_RECEIPT_B2C"; payload: SaleReceiptPayload }
  | { kind: "DELIVERY_SLIP_B2B"; payload: DeliverySlipB2bPayload }
  | { kind: "PERIODIC_CHECK_B2C"; payload: PeriodicCheckB2cPayload }
  | { kind: "PERIODIC_CHECK_B2B"; payload: PeriodicCheckB2bPayload }
  | { kind: "WORK_CONFIRMATION"; payload: WorkConfPayload };

/**
 * Build the data payload for a given visit + kind. The Track 4 HTML
 * print page consumes this directly; the PDF render path wraps it in
 * a React element via {@link buildPreviewElement}.
 */
export async function buildVisitDocumentPayload(
  visitId: string,
  kind: PreviewKind,
  langPair: PdfLangPair,
): Promise<VisitDocumentPayload> {
  const v = await fetchVisit(visitId);
  switch (kind) {
    case "DELIVERY_RECEIPT":
      return { kind, payload: await buildDeliveryReceipt(v, langPair) };
    case "SALE_RECEIPT_B2C":
      return { kind, payload: await buildSaleReceiptB2c(v, langPair) };
    case "DELIVERY_SLIP_B2B":
      return { kind, payload: await buildDeliverySlipB2b(v, langPair) };
    case "PERIODIC_CHECK_B2C":
      return { kind, payload: await buildPeriodicCheckB2c(v, langPair) };
    case "PERIODIC_CHECK_B2B":
      return { kind, payload: await buildPeriodicCheckB2b(v, langPair) };
    case "WORK_CONFIRMATION":
      return { kind, payload: await buildWorkConfirmation(v, langPair) };
  }
}

// Re-export payload types so consumers (HTML print components, API
// boundary types) don't have to reach into the individual template files.
export type {
  DeliveryReceiptPayload,
  SaleReceiptPayload,
  DeliverySlipB2bPayload,
  PeriodicCheckB2cPayload,
  PeriodicCheckB2bPayload,
  WorkConfPayload,
};

/**
 * Build the React element for a given visit + kind. Throws ValidationError
 * if the visit / customer combination is incompatible with the requested
 * document kind (e.g. asking for PERIODIC_CHECK_B2B on a B2C visit).
 */
export async function buildPreviewElement(
  visitId: string,
  kind: PreviewKind,
  langPair: PdfLangPair,
): Promise<React.ReactElement> {
  const v = await fetchVisit(visitId);
  switch (kind) {
    case "DELIVERY_RECEIPT": {
      const payload = await buildDeliveryReceipt(v, langPair);
      return React.createElement(DeliveryReceipt, { payload });
    }
    case "SALE_RECEIPT_B2C": {
      const payload = await buildSaleReceiptB2c(v, langPair);
      return React.createElement(SaleReceiptB2C, { payload });
    }
    case "DELIVERY_SLIP_B2B": {
      const payload = await buildDeliverySlipB2b(v, langPair);
      return React.createElement(DeliverySlipB2B, { payload });
    }
    case "PERIODIC_CHECK_B2C": {
      const payload = await buildPeriodicCheckB2c(v, langPair);
      return React.createElement(PeriodicCheckB2C, { payload });
    }
    case "PERIODIC_CHECK_B2B": {
      const payload = await buildPeriodicCheckB2b(v, langPair);
      return React.createElement(PeriodicCheckB2B, { payload });
    }
    case "WORK_CONFIRMATION": {
      const payload = await buildWorkConfirmation(v, langPair);
      return React.createElement(WorkConfirmation, { payload });
    }
  }
}

export function suggestedFilename(visitId: string, kind: PreviewKind): string {
  return `${kind.toLowerCase()}-${shortNumber(visitId)}.pdf`;
}
