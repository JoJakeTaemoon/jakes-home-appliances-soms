/**
 * Smoke test for the PDF template + render layer.
 *
 * We don't hit Prisma here — we render the shared `ContractDocument` with a
 * hand-built props object and assert that:
 *   - `renderToBuffer` returns a Buffer
 *   - The buffer starts with the standard `%PDF-` magic bytes
 *   - Both bilingual pairs (vi-ko default, vi-en) work
 *   - The language-pair helpers resolve the right primary/secondary dicts
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { B2bContract } from "@/lib/pdf/templates/b2b-contract";
import { B2cRentalContract } from "@/lib/pdf/templates/b2c-rental-contract";
import { B2cSaleContract } from "@/lib/pdf/templates/b2c-sale-contract";
import { AppendixContract } from "@/lib/pdf/templates/appendix";
import { MaintenanceContract } from "@/lib/pdf/templates/maintenance-contract";
import { splitLangPair, langPairForLocale } from "@/lib/pdf/types";
import { pickPdfPair } from "@/lib/pdf/messages";
import type {
  PdfContractView,
  PdfCustomerSummary,
  PdfEquipmentLine,
  PdfLangPair,
} from "@/lib/pdf/types";

const customerB2C: PdfCustomerSummary = {
  id: "c1",
  code: "KH00001",
  name: "Nguyễn Văn Test",
  type: "B2C",
  shortcode: null,
  taxCode: null,
  residency: "DOMESTIC",
  nationalId: "001234567890",
  passportNumber: null,
  nationality: null,
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
  residency: null,
  nationalId: null,
  passportNumber: null,
  nationality: null,
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

function makeProps(langPair: PdfLangPair, overrides: Partial<{ contract: PdfContractView; customer: PdfCustomerSummary }> = {}) {
  return {
    langPair,
    contract: overrides.contract ?? baseContract,
    customer: overrides.customer ?? customerB2C,
    equipment,
    generatedAt: new Date("2026-05-27T00:00:00.000Z"),
    company: {
      legalName: "CÔNG TY TNHH MTV TM&DV ĐẠI Á",
      address: "Số 47 Đường Hoàng Trọng Mậu, TP Hồ Chí Minh",
      representativeName: "CHOI ONE HO",
      taxCode: "0309395579",
    },
    hqPhone: "028-2225-3939",
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

describe("bilingual language-pair helpers", () => {
  it("splits vi-ko into Vietnamese primary + Korean secondary", () => {
    expect(splitLangPair("vi-ko")).toEqual({ primary: "vi", secondary: "ko" });
  });
  it("splits vi-en into Vietnamese primary + English secondary", () => {
    expect(splitLangPair("vi-en")).toEqual({ primary: "vi", secondary: "en" });
  });
  it("defaults a single locale to vi-ko, but maps en → vi-en", () => {
    expect(langPairForLocale("ko")).toBe("vi-ko");
    expect(langPairForLocale("vi")).toBe("vi-ko");
    expect(langPairForLocale(null)).toBe("vi-ko");
    expect(langPairForLocale("en")).toBe("vi-en");
  });
  it("pickPdfPair resolves two distinct dictionaries", () => {
    const ko = pickPdfPair("vi-ko");
    expect(ko.primary.documentTitle.RENTAL_B2C).toBe("Hợp đồng thuê máy lọc nước (Hộ gia đình)");
    expect(ko.secondary.documentTitle.RENTAL_B2C).toBe("가정집 정수기 임대 계약서");
    const en = pickPdfPair("vi-en");
    expect(en.primary).toBe(ko.primary); // same Vietnamese primary
    expect(en.secondary).not.toBe(ko.secondary); // English secondary differs
  });
});

describe("PDF templates → renderToBuffer", () => {
  it("renders B2C RENTAL in vi-ko (default pair)", async () => {
    await assertIsPdfBuffer(React.createElement(B2cRentalContract, makeProps("vi-ko")));
  });
  it("renders B2C SALE in vi-ko", async () => {
    await assertIsPdfBuffer(
      React.createElement(
        B2cSaleContract,
        makeProps("vi-ko", {
          contract: { ...baseContract, type: "SALE", monthlyMaintenanceFee: null, totalContractValue: 5_000_000 },
        }),
      ),
    );
  });
  it("renders B2B contract in vi-en", async () => {
    await assertIsPdfBuffer(
      React.createElement(B2bContract, makeProps("vi-en", { customer: customerB2B })),
    );
  });
  it("renders MAINTENANCE contract in vi-ko", async () => {
    await assertIsPdfBuffer(
      React.createElement(MaintenanceContract, makeProps("vi-ko", {
        contract: { ...baseContract, type: "MAINTENANCE", termMonths: 12 },
      })),
    );
  });
  it("renders an APPENDIX with revision header in vi-en", async () => {
    await assertIsPdfBuffer(
      React.createElement(AppendixContract, makeProps("vi-en", {
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
