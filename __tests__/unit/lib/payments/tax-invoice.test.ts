import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: { findUnique: vi.fn() },
    taxInvoice: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    document: { create: vi.fn() },
  },
}));

vi.mock("@/lib/notifications/send", () => ({
  sendNotification: vi
    .fn()
    .mockResolvedValue([{ notificationLogId: "log-1", status: "MOCKED" }]),
}));

vi.mock("node:fs/promises", async () => {
  const real = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...real,
    default: real,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("node:fs", async () => {
  const real = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...real,
    default: real,
    existsSync: vi.fn().mockReturnValue(false),
  };
});

import prisma from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications/send";
import { uploadTaxInvoice, reissueTaxInvoice } from "@/lib/tax-invoices/operations";
import { issueSInvoice, SInvoiceNotImplementedError } from "@/lib/tax-invoices/sinvoice-stub";

const mockedPrisma = vi.mocked(prisma, true);
const mockedSend = vi.mocked(sendNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("uploadTaxInvoice", () => {
  it("creates a TaxInvoice row + Document + queues EMAIL_TAX_INVOICE", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      customerId: "c1",
      actualAmount: { toString: () => "1000000" },
      method: "BANK_TRANSFER",
      customer: {
        id: "c1",
        name: "Acme",
        contacts: [{ id: "cp", role: "CONTRACT_PARTY", isPrimary: false }],
      },
    } as never);
    mockedPrisma.taxInvoice.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.taxInvoice.create.mockResolvedValueOnce({ id: "ti-1" } as never);
    mockedPrisma.taxInvoice.update.mockResolvedValueOnce({ id: "ti-1" } as never);
    mockedPrisma.document.create.mockResolvedValueOnce({ id: "doc-1" } as never);

    const result = await uploadTaxInvoice({
      paymentId: "pay-1",
      invoiceNumber: "GTGT-001",
      invoiceDate: new Date("2026-06-15"),
      pdfBuffer: Buffer.from("%PDF-1.4 stub"),
      filename: "invoice.pdf",
      actorUserId: "u1",
    });
    expect(result.invoice.id).toBe("ti-1");
    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: "EMAIL_TAX_INVOICE",
        customerContactId: "cp",
      }),
    );
  });

  it("replaces an existing TaxInvoice row on second upload (audit REPLACE)", async () => {
    mockedPrisma.payment.findUnique.mockResolvedValueOnce({
      id: "pay-1",
      customerId: "c1",
      actualAmount: { toString: () => "500000" },
      method: "CASH",
      customer: {
        id: "c1",
        name: "Acme",
        contacts: [{ id: "cp", role: "CONTRACT_PARTY", isPrimary: false }],
      },
    } as never);
    mockedPrisma.taxInvoice.findUnique.mockResolvedValueOnce({ id: "ti-1" } as never);
    mockedPrisma.taxInvoice.update.mockResolvedValue({ id: "ti-1" } as never);
    mockedPrisma.document.create.mockResolvedValueOnce({ id: "doc-2" } as never);

    const result = await uploadTaxInvoice({
      paymentId: "pay-1",
      invoiceNumber: "GTGT-002",
      invoiceDate: new Date("2026-06-15"),
      pdfBuffer: Buffer.from("%PDF-1.4 stub"),
      filename: "invoice.pdf",
      actorUserId: "u1",
    });
    expect(result.invoice.id).toBe("ti-1");
    expect(mockedPrisma.taxInvoice.update).toHaveBeenCalled();
  });
});

describe("reissueTaxInvoice", () => {
  it("tombstones the original row with the reason", async () => {
    mockedPrisma.taxInvoice.findUnique.mockResolvedValueOnce({
      id: "ti-1",
      invoiceNumber: "GTGT-001",
      notes: null,
    } as never);
    mockedPrisma.taxInvoice.update.mockResolvedValueOnce({ id: "ti-1" } as never);
    const r = await reissueTaxInvoice({
      taxInvoiceId: "ti-1",
      reason: "Wrong tax code",
      actorUserId: "u1",
    });
    expect(r.tombstoned.id).toBe("ti-1");
    const call = mockedPrisma.taxInvoice.update.mock.calls[0][0];
    expect(call.data.invoiceNumber).toBeNull();
    expect(call.data.notes).toContain("Wrong tax code");
  });
});

describe("SInvoice stub", () => {
  it("throws SInvoiceNotImplementedError", async () => {
    await expect(issueSInvoice({} as never)).rejects.toThrow(
      SInvoiceNotImplementedError,
    );
  });
});
