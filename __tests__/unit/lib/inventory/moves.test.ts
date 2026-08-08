import { describe, it, expect, vi } from "vitest";
import {
  applyStockMove,
  computeAdjustDelta,
  recordOpeningStock,
} from "@/lib/inventory/moves";
import type { Prisma } from "@/generated/prisma/client";

/** Minimal mock TransactionClient capturing the calls applyStockMove makes. */
function mockTx() {
  const stockMoveCreate = vi.fn().mockResolvedValue({ id: "move-1" });
  const modelUpdate = vi.fn().mockResolvedValue({});
  const consumableUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    stockMove: { create: stockMoveCreate },
    equipmentModel: { update: modelUpdate },
    consumable: { update: consumableUpdate },
  } as unknown as Prisma.TransactionClient;
  return { tx, stockMoveCreate, modelUpdate, consumableUpdate };
}

describe("applyStockMove", () => {
  it("OUT on a MODEL decrements stockOnHand by the quantity", async () => {
    const { tx, stockMoveCreate, modelUpdate, consumableUpdate } = mockTx();
    await applyStockMove(tx, {
      itemKind: "MODEL",
      equipmentModelId: "m1",
      direction: "OUT",
      quantity: 3,
      reason: "INSTALL",
    });
    expect(stockMoveCreate).toHaveBeenCalledOnce();
    expect(stockMoveCreate.mock.calls[0][0].data).toMatchObject({
      itemKind: "MODEL",
      equipmentModelId: "m1",
      consumableId: null,
      direction: "OUT",
      quantity: 3,
    });
    expect(modelUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { stockOnHand: { increment: -3 } },
    });
    expect(consumableUpdate).not.toHaveBeenCalled();
  });

  it("IN on a CONSUMABLE increments stockOnHand by the quantity", async () => {
    const { tx, modelUpdate, consumableUpdate } = mockTx();
    await applyStockMove(tx, {
      itemKind: "CONSUMABLE",
      consumableId: "c1",
      direction: "IN",
      quantity: 10,
      reason: "PURCHASE",
    });
    expect(consumableUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { stockOnHand: { increment: 10 } },
    });
    expect(modelUpdate).not.toHaveBeenCalled();
  });

  it("allows the on-hand to go negative (no guard, decrement still applied)", async () => {
    const { tx, modelUpdate } = mockTx();
    await applyStockMove(tx, {
      itemKind: "MODEL",
      equipmentModelId: "m1",
      direction: "OUT",
      quantity: 999,
      reason: "SALE",
    });
    // The helper never inspects current stock — a decrement past zero is fine.
    expect(modelUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { stockOnHand: { increment: -999 } },
    });
  });

  it("rejects a non-positive quantity", async () => {
    const { tx } = mockTx();
    await expect(
      applyStockMove(tx, {
        itemKind: "MODEL",
        equipmentModelId: "m1",
        direction: "IN",
        quantity: 0,
        reason: "ADJUST",
      }),
    ).rejects.toThrow(/positive/);
  });
});

describe("computeAdjustDelta (설정-목표 조정)", () => {
  it("returns the signed difference target - current", () => {
    expect(computeAdjustDelta(20, 12)).toBe(8); // 위로 조정 → IN 8
    expect(computeAdjustDelta(5, 12)).toBe(-7); // 아래로 조정 → OUT 7
    expect(computeAdjustDelta(12, 12)).toBe(0); // 변화 없음
    expect(computeAdjustDelta(3, -2)).toBe(5); // 음수 현재고에서 위로
  });
});

describe("recordOpeningStock", () => {
  it("is a no-op for a zero opening balance", async () => {
    const { tx, stockMoveCreate } = mockTx();
    const result = await recordOpeningStock(tx, {
      itemKind: "MODEL",
      equipmentModelId: "m1",
      qty: 0,
    });
    expect(result).toBeNull();
    expect(stockMoveCreate).not.toHaveBeenCalled();
  });

  it("records a negative opening balance as an OUT move", async () => {
    const { tx, stockMoveCreate, modelUpdate } = mockTx();
    await recordOpeningStock(tx, {
      itemKind: "MODEL",
      equipmentModelId: "m1",
      qty: -4,
    });
    expect(stockMoveCreate.mock.calls[0][0].data).toMatchObject({
      direction: "OUT",
      quantity: 4,
      reason: "ADJUST",
    });
    expect(modelUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { stockOnHand: { increment: -4 } },
    });
  });
});
