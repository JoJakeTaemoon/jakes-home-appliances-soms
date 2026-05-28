import { describe, it, expect } from "vitest";
import {
  createPaymentSchema,
  listPaymentQuerySchema,
  recordBankTransferSchema,
  writeOffSchema,
  applyPartialSchema,
} from "@/lib/validators/payment";
import {
  uploadTaxInvoiceMetaSchema,
  reissueTaxInvoiceSchema,
} from "@/lib/validators/taxInvoice";

describe("createPaymentSchema", () => {
  it("accepts a valid expected payment", () => {
    const r = createPaymentSchema.safeParse({
      customerId: "c1",
      expectedAmount: 500000,
      dueDate: "2026-06-10",
    });
    expect(r.success).toBe(true);
  });
  it("coerces string amounts", () => {
    const r = createPaymentSchema.safeParse({
      customerId: "c1",
      expectedAmount: "500000",
      dueDate: new Date(),
    });
    expect(r.success).toBe(true);
  });
  it("rejects negative amounts", () => {
    const r = createPaymentSchema.safeParse({
      customerId: "c1",
      expectedAmount: -1,
      dueDate: new Date(),
    });
    expect(r.success).toBe(false);
  });
});

describe("listPaymentQuerySchema", () => {
  it("defaults page + pageSize", () => {
    const r = listPaymentQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.pageSize).toBe(25);
    }
  });
  it("parses overdueOnly true/false", () => {
    const r = listPaymentQuerySchema.safeParse({ overdueOnly: "true" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.overdueOnly).toBe(true);
  });
});

describe("recordBankTransferSchema", () => {
  it("requires reference + amount", () => {
    const ok = recordBankTransferSchema.safeParse({
      customerId: "c1",
      actualAmount: 1_000_000,
      reference: "VCB-202606-9001",
      transferredAt: "2026-06-15",
    });
    expect(ok.success).toBe(true);
    const bad = recordBankTransferSchema.safeParse({
      customerId: "c1",
      actualAmount: 1_000_000,
      transferredAt: "2026-06-15",
    });
    expect(bad.success).toBe(false);
  });
});

describe("writeOffSchema / applyPartialSchema", () => {
  it("write-off requires a reason", () => {
    expect(writeOffSchema.safeParse({}).success).toBe(false);
    expect(writeOffSchema.safeParse({ reason: "Customer bankrupt" }).success).toBe(true);
  });
  it("partial requires a positive amount", () => {
    expect(applyPartialSchema.safeParse({ partialAmount: 0 }).success).toBe(true);
    expect(applyPartialSchema.safeParse({ partialAmount: -1 }).success).toBe(false);
  });
});

describe("tax invoice validators", () => {
  it("upload meta accepts the full payload", () => {
    const r = uploadTaxInvoiceMetaSchema.safeParse({
      paymentId: "p1",
      invoiceNumber: "GTGT-001",
      invoiceDate: "2026-06-15",
    });
    expect(r.success).toBe(true);
  });
  it("upload meta rejects missing invoice number", () => {
    const r = uploadTaxInvoiceMetaSchema.safeParse({
      paymentId: "p1",
      invoiceDate: "2026-06-15",
    });
    expect(r.success).toBe(false);
  });
  it("reissue requires reason", () => {
    expect(reissueTaxInvoiceSchema.safeParse({ reason: "Wrong tax code" }).success).toBe(true);
    expect(reissueTaxInvoiceSchema.safeParse({}).success).toBe(false);
  });
});
