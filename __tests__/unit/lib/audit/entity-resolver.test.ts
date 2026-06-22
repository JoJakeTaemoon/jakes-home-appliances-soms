/**
 * RED — server-side batch resolver: (entityType, entityId)[] → display map.
 *
 * Groups by entityType then issues one Prisma query per type with the
 * appropriate display field (name / code / username / serialNo / scheduledAt
 * formatted / etc). Returns `Map<"${entityType}:${entityId}", string>`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    customer: { findMany: vi.fn() },
    contract: { findMany: vi.fn() },
    visit: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    equipment: { findMany: vi.fn() },
    serviceRequest: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    brand: { findMany: vi.fn() },
    productCategory: { findMany: vi.fn() },
    consumable: { findMany: vi.fn() },
    accessory: { findMany: vi.fn() },
    chargePolicy: { findMany: vi.fn() },
    site: { findMany: vi.fn() },
    customerContact: { findMany: vi.fn() },
    equipmentModel: { findMany: vi.fn() },
    taxInvoice: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { resolveEntityDisplays } from "@/lib/audit/entity-resolver";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveEntityDisplays", () => {
  it("returns an empty map for empty input", async () => {
    const out = await resolveEntityDisplays([]);
    expect(out.size).toBe(0);
  });

  it("groups by entityType and issues one query per type (Customer + Contract)", async () => {
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "c1", name: "김철수" },
      { id: "c2", name: "박영희" },
    ]);
    (prisma.contract.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "k1", contractNumber: "HD-20260526/JH-KH0001" },
    ]);

    const out = await resolveEntityDisplays([
      { entityType: "Customer", entityId: "c1" },
      { entityType: "Customer", entityId: "c2" },
      { entityType: "Contract", entityId: "k1" },
    ]);

    expect(out.get("Customer:c1")).toBe("김철수");
    expect(out.get("Customer:c2")).toBe("박영희");
    expect(out.get("Contract:k1")).toBe("HD-20260526/JH-KH0001");
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.contract.findMany).toHaveBeenCalledTimes(1);
  });

  it("uses username for User", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "u1", username: "jake" },
    ]);
    const out = await resolveEntityDisplays([
      { entityType: "User", entityId: "u1" },
    ]);
    expect(out.get("User:u1")).toBe("jake");
  });

  it("uses serialNo for Equipment", async () => {
    (prisma.equipment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "e1", serialNumber: "SN-001" },
    ]);
    const out = await resolveEntityDisplays([
      { entityType: "Equipment", entityId: "e1" },
    ]);
    expect(out.get("Equipment:e1")).toBe("SN-001");
  });

  it("uses code for ServiceRequest", async () => {
    (prisma.serviceRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "sr1", code: "SR-12345" },
    ]);
    const out = await resolveEntityDisplays([
      { entityType: "ServiceRequest", entityId: "sr1" },
    ]);
    expect(out.get("ServiceRequest:sr1")).toBe("SR-12345");
  });

  it("uses reference (or id) for Payment", async () => {
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "p1", reference: "RC-001" },
      { id: "p2", reference: null },
    ]);
    const out = await resolveEntityDisplays([
      { entityType: "Payment", entityId: "p1" },
      { entityType: "Payment", entityId: "p2" },
    ]);
    expect(out.get("Payment:p1")).toBe("RC-001");
    expect(out.get("Payment:p2")).toBe("p2");
  });

  it("ignores rows with null entityId", async () => {
    const out = await resolveEntityDisplays([
      { entityType: "Customer", entityId: null },
    ]);
    expect(out.size).toBe(0);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it("ignores unknown entityType silently", async () => {
    const out = await resolveEntityDisplays([
      { entityType: "Frobnicator", entityId: "x1" },
    ]);
    expect(out.size).toBe(0);
  });

  it("deduplicates entityIds passed to Prisma", async () => {
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "c1", name: "김철수" },
    ]);
    await resolveEntityDisplays([
      { entityType: "Customer", entityId: "c1" },
      { entityType: "Customer", entityId: "c1" },
      { entityType: "Customer", entityId: "c1" },
    ]);
    const call = (prisma.customer.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    // Prisma `where: { id: { in: [...] } }`
    expect(call.where.id.in).toEqual(["c1"]);
  });
});
