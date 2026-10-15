/**
 * Order state moves (PENDING → DELIVERED | CANCELLED).
 *
 * Orders used to be create-only, so the DELIVERED stock decrement only ran
 * when an order was *created* as DELIVERED. These pin the shared transition
 * used by PATCH /api/orders/[id] and by visit completion.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { tx, applyStockMove } = vi.hoisted(() => ({
  tx: { order: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() } },
  applyStockMove: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    order: tx.order,
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));
vi.mock("@/lib/inventory/moves", () => ({
  applyStockMove: (...a: unknown[]) => applyStockMove(...a),
}));

import { logAudit } from "@/lib/audit";
import { ConflictError, NotFoundError } from "@/lib/api/error";
import {
  transitionOrder,
  deliverPendingOrdersForVisit,
} from "@/lib/orders/delivery";

const ORDER = {
  id: "ord-1",
  orderNumber: "SO261015-001",
  state: "PENDING",
  visitId: "v1",
  deliveredAt: null,
  items: [
    { productKind: "CONSUMABLE", consumableId: "cons-1", quantity: 2, unitPrice: { toString: () => "150000" } },
    { productKind: "EQUIPMENT", consumableId: null, quantity: 1, unitPrice: { toString: () => "9000000" } },
    { productKind: "OTHER", consumableId: null, quantity: 1, unitPrice: { toString: () => "0" } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.order.findUnique.mockResolvedValue(ORDER);
  tx.order.updateMany.mockResolvedValue({ count: 1 });
});

describe("transitionOrder", () => {
  it("DELIVERED stamps deliveredAt, takes consumable lines out of stock and audits", async () => {
    const out = await transitionOrder({ orderId: "ord-1", to: "DELIVERED", actorId: "u1" });

    const upd = tx.order.updateMany.mock.calls[0][0];
    // Prior state pinned in WHERE — a concurrent cancel can't be overwritten.
    expect(upd.where).toEqual({ id: "ord-1", state: "PENDING" });
    expect(upd.data.state).toBe("DELIVERED");
    expect(upd.data.deliveredAt).toBeInstanceOf(Date);

    // Only the CONSUMABLE line moves stock (EQUIPMENT moves at install).
    expect(applyStockMove).toHaveBeenCalledTimes(1);
    expect(applyStockMove.mock.calls[0][1]).toMatchObject({
      itemKind: "CONSUMABLE",
      consumableId: "cons-1",
      direction: "OUT",
      quantity: 2,
      reason: "SALE",
      unitPrice: 150000,
      sourceType: "ORDER",
      sourceId: "ord-1",
      createdById: "u1",
    });

    expect(out.state).toBe("DELIVERED");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ORDER_DELIVER",
        entityType: "Order",
        entityId: "ord-1",
        actorId: "u1",
        before: { state: "PENDING" },
      }),
    );
  });

  it("keeps a caller-supplied delivery date", async () => {
    const when = new Date("2026-10-14T09:00:00Z");
    await transitionOrder({ orderId: "ord-1", to: "DELIVERED", actorId: "u1", deliveredAt: when });
    expect(tx.order.updateMany.mock.calls[0][0].data.deliveredAt).toBe(when);
  });

  it("CANCELLED touches no stock and audits ORDER_CANCEL", async () => {
    const out = await transitionOrder({ orderId: "ord-1", to: "CANCELLED", actorId: "u1" });
    expect(tx.order.updateMany.mock.calls[0][0].data).toEqual({ state: "CANCELLED" });
    expect(applyStockMove).not.toHaveBeenCalled();
    expect(out.state).toBe("CANCELLED");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "ORDER_CANCEL" }));
  });

  it("404s an unknown order", async () => {
    tx.order.findUnique.mockResolvedValueOnce(null);
    await expect(
      transitionOrder({ orderId: "nope", to: "DELIVERED", actorId: "u1" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("409s an order that already left PENDING (or lost the race)", async () => {
    tx.order.findUnique.mockResolvedValueOnce({ ...ORDER, state: "DELIVERED" });
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      transitionOrder({ orderId: "ord-1", to: "CANCELLED", actorId: "u1" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(applyStockMove).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("deliverPendingOrdersForVisit", () => {
  it("delivers every PENDING order linked to the visit and skips ones that moved meanwhile", async () => {
    tx.order.findMany.mockResolvedValueOnce([{ id: "ord-1" }, { id: "ord-2" }]);
    tx.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 }); // office cancelled ord-2 a moment ago

    const ids = await deliverPendingOrdersForVisit("v1", "tech-1");

    expect(tx.order.findMany.mock.calls[0][0].where).toEqual({ visitId: "v1", state: "PENDING" });
    expect(ids).toEqual(["ord-1"]);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });
});
