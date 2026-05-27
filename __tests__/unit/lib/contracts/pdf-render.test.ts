/**
 * Smoke test for the PDF template + render layer.
 *
 * We don't hit Prisma here — we render the shared `ContractDocument` with a
 * hand-built props object and assert that:
 *   - `renderToBuffer` returns a Buffer
 *   - The buffer starts with the standard `%PDF-` magic bytes
 *   - All 3 locales work
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { B2bContract } from "@/lib/pdf/templates/b2b-contract";
import { B2cRentalContract } from "@/lib/pdf/templates/b2c-rental-contract";
import { B2cSaleContract } from "@/lib/pdf/templates/b2c-sale-contract";
import { AppendixContract } from "@/lib/pdf/templates/appendix";
import { MaintenanceContract } from "@/lib/pdf/templates/maintenance-contract";
import type {
  PdfContractView,
  PdfCustomerSummary,
  PdfEquipmentLine,
  PdfLocale,
} from "@/lib/pdf/types";

const customerB2C: PdfCustomerSummary = {
  id: "c1",
  code: "KH00001",
  name: "Nguyễn Văn Test",
  type: "B2C",
  shortcode: null,
  taxCode: null,
  address: "123 Test St",
  district: "Q1",
  city: "HCMC",
  contractParty: {
    name: "Nguyễn Văn Test",
    title: "Khách hàng",
    phone: "0900000001",
    email: "kh@example.com",
    language: "vi",
  },
};

const customerB2B: PdfCustomerSummary = {
  ...customerB2C,
  code: "KH00002",
  name: "Sheraton VN Ltd.",
  type: "B2B",
  shortcode: "SHV",
  taxCode: "0399999999",
};

const baseContract: PdfContractView = {
  id: "k1",
  contractNumber: "HD-20260526/SA-KH00001",
  type: "RENTAL",
  state: "ACTIVE",
  startDate: new Date("2026-05-26"),
  endDate: new Date("2029-05-26"),
  termMonths: 36,
  monthlyMaintenanceFee: 200_000,
  totalContractValue: null,
  signedByCustomerAt: new Date(),
  signedByCompanyAt: new Date(),
  activatedAt: new Date(),
  notes: null,
  parentContractNumber: null,
  amendmentRevision: 0,
  amendmentReason: null,
};

const equipment: PdfEquipmentLine[] = [
  {
    equipmentId: "e1",
    modelCode: "PTS-2100",
    modelName: "Pre-set Water Purifier",
    serialNumber: "SN-0001",
    siteName: "HQ Building",
    unitPrice: 200_000,
    quantity: 1,
    notes: null,
  },
];

function makeProps(locale: PdfLocale, overrides: Partial<{ contract: PdfContractView; customer: PdfCustomerSummary }> = {}) {
  return {
    locale,
    contract: overrides.contract ?? baseContract,
    customer: overrides.customer ?? customerB2C,
    equipment,
    generatedAt: new Date("2026-05-27T00:00:00.000Z"),
  };
}

async function assertIsPdfBuffer(element: React.ReactElement) {
  // @react-pdf/renderer's `renderToBuffer` is generic on DocumentProps but
  // each template wraps its content in a <Document>; cast the element so the
  // test can pass any concrete template without restating the props shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await renderToBuffer(element as any);
  expect(buf).toBeInstanceOf(Buffer);
  expect(buf.byteLength).toBeGreaterThan(500);
  expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
}

describe("PDF templates → renderToBuffer", () => {
  it("renders B2C RENTAL in VI", async () => {
    await assertIsPdfBuffer(React.createElement(B2cRentalContract, makeProps("vi")));
  });
  it("renders B2C SALE in KO", async () => {
    await assertIsPdfBuffer(
      React.createElement(
        B2cSaleContract,
        makeProps("ko", {
          contract: { ...baseContract, type: "SALE", monthlyMaintenanceFee: null, totalContractValue: 5_000_000 },
        }),
      ),
    );
  });
  it("renders B2B contract in EN", async () => {
    await assertIsPdfBuffer(
      React.createElement(B2bContract, makeProps("en", { customer: customerB2B })),
    );
  });
  it("renders MAINTENANCE contract", async () => {
    await assertIsPdfBuffer(
      React.createElement(MaintenanceContract, makeProps("vi", {
        contract: { ...baseContract, type: "MAINTENANCE", termMonths: 12 },
      })),
    );
  });
  it("renders an APPENDIX with revision header", async () => {
    await assertIsPdfBuffer(
      React.createElement(AppendixContract, makeProps("vi", {
        customer: customerB2B,
        contract: {
          ...baseContract,
          contractNumber: "HD-20260526/SA-SHV-A1",
          parentContractNumber: "HD-20260526/SA-SHV",
          amendmentRevision: 1,
          amendmentReason: "Added 2 units on floor 5",
        },
      })),
    );
  });
});
