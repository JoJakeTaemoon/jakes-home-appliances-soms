/**
 * Customer merge unit test — mocks prisma transactional helper.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockTx = {
  site: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  customerContact: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  equipment: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  contract: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  serviceRequest: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  visit: { updateMany: vi.fn().mockResolvedValue({ count: 5 }) },
  payment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  notificationLog: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  document: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  customer: { update: vi.fn().mockResolvedValue({ id: "src", status: "INACTIVE" }) },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    customer: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  },
}));

import prisma from "@/lib/prisma";
import { mergeCustomers } from "@/lib/customers/merge";

beforeEach(() => {
  vi.clearAllMocks();
  // ensure mockTx fns return the same defaults after clearAllMocks
  mockTx.site.updateMany.mockResolvedValue({ count: 1 });
  mockTx.customerContact.updateMany.mockResolvedValue({ count: 2 });
  mockTx.equipment.updateMany.mockResolvedValue({ count: 3 });
  mockTx.contract.updateMany.mockResolvedValue({ count: 0 });
  mockTx.serviceRequest.updateMany.mockResolvedValue({ count: 0 });
  mockTx.visit.updateMany.mockResolvedValue({ count: 5 });
  mockTx.payment.updateMany.mockResolvedValue({ count: 0 });
  mockTx.notificationLog.updateMany.mockResolvedValue({ count: 0 });
  mockTx.document.updateMany.mockResolvedValue({ count: 0 });
  mockTx.customer.update.mockResolvedValue({ id: "src", status: "INACTIVE" });
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
  );
});

describe("mergeCustomers", () => {
  it("rejects merging a customer into itself", async () => {
    await expect(
      mergeCustomers({ sourceId: "x", targetId: "x", actorId: "u1" }),
    ).rejects.toThrow();
  });

  it("rejects when source missing", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "tgt",
        code: "KH0002",
        name: "Target",
        status: "ACTIVE",
      });
    await expect(
      mergeCustomers({ sourceId: "src", targetId: "tgt", actorId: "u1" }),
    ).rejects.toThrow();
  });

  it("rejects when target is INACTIVE", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: "src",
        code: "KH0001",
        name: "Source",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: "tgt",
        code: "KH0002",
        name: "Target",
        status: "INACTIVE",
      });
    await expect(
      mergeCustomers({ sourceId: "src", targetId: "tgt", actorId: "u1" }),
    ).rejects.toThrow();
  });

  it("repoints every relation and deactivates source", async () => {
    (prisma.customer.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: "src",
        code: "KH0001",
        name: "Source",
        status: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: "tgt",
        code: "KH0002",
        name: "Target",
        status: "ACTIVE",
      });
    const out = await mergeCustomers({
      sourceId: "src",
      targetId: "tgt",
      actorId: "u1",
    });
    expect(out.moved).toEqual({
      sites: 1,
      contacts: 2,
      equipment: 3,
      contracts: 0,
      serviceRequests: 0,
      visits: 5,
      payments: 0,
      notificationLogs: 0,
      documents: 0,
    });
    expect(mockTx.site.updateMany).toHaveBeenCalledWith({
      where: { customerId: "src" },
      data: { customerId: "tgt" },
    });
    expect(mockTx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "src" },
        data: expect.objectContaining({
          status: "INACTIVE",
          deactivationReason: "Merged into KH0002",
        }),
      }),
    );
  });
});
