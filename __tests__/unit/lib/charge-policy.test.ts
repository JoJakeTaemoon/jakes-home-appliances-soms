import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    chargePolicy: { findFirst: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { decideCharge, defaultChargeRule } from "@/lib/charge-policy";

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.chargePolicy.findFirst.mockResolvedValue(null);
});

describe("defaultChargeRule (pure)", () => {
  it("RENTAL is always free", () => {
    const r1 = defaultChargeRule({ accessoryId: "a", contractType: "RENTAL", withinWarranty: false, isMinorPart: false });
    const r2 = defaultChargeRule({ consumableId: "c", contractType: "RENTAL", withinWarranty: false });
    expect(r1.isChargeable).toBe(false);
    expect(r2.isChargeable).toBe(false);
  });

  it("SALE within warranty is free", () => {
    const r = defaultChargeRule({ accessoryId: "a", contractType: "SALE", withinWarranty: true });
    expect(r.isChargeable).toBe(false);
    expect(r.source).toBe("DEFAULT");
  });

  it("SALE after warranty is charged", () => {
    const r = defaultChargeRule({ accessoryId: "a", contractType: "SALE", withinWarranty: false });
    expect(r.isChargeable).toBe(true);
  });

  it("MAINTENANCE + consumable is free (PDF A.5)", () => {
    const r = defaultChargeRule({ consumableId: "c", contractType: "MAINTENANCE", withinWarranty: false });
    expect(r.isChargeable).toBe(false);
  });

  it("MAINTENANCE + minor accessory is free", () => {
    const r = defaultChargeRule({ accessoryId: "a", isMinorPart: true, contractType: "MAINTENANCE", withinWarranty: false });
    expect(r.isChargeable).toBe(false);
  });

  it("MAINTENANCE + major accessory is charged", () => {
    const r = defaultChargeRule({ accessoryId: "a", isMinorPart: false, contractType: "MAINTENANCE", withinWarranty: false });
    expect(r.isChargeable).toBe(true);
  });
});

describe("decideCharge (DB override)", () => {
  it("returns OVERRIDE when a ChargePolicy row matches", async () => {
    mockedPrisma.chargePolicy.findFirst.mockResolvedValueOnce({
      isChargeable: true,
      notes: "Force-bill on RENTAL because part was customer-damaged",
    } as never);
    const r = await decideCharge({ accessoryId: "a", contractType: "RENTAL", withinWarranty: false });
    expect(r.isChargeable).toBe(true);
    expect(r.source).toBe("OVERRIDE");
  });

  it("falls through to DEFAULT when no override", async () => {
    const r = await decideCharge({
      accessoryId: "a",
      isMinorPart: true,
      contractType: "MAINTENANCE",
      withinWarranty: false,
    });
    expect(r.source).toBe("DEFAULT");
    expect(r.isChargeable).toBe(false);
  });

  it("normalizes withinWarranty=false for non-SALE lookups", async () => {
    await decideCharge({ accessoryId: "a", contractType: "RENTAL", withinWarranty: true });
    expect(mockedPrisma.chargePolicy.findFirst).toHaveBeenCalledWith({
      where: { accessoryId: "a", contractType: "RENTAL", withinWarranty: false },
      select: { isChargeable: true, notes: true },
    });
  });

  it("scopes lookup to consumableId when accessory not set", async () => {
    await decideCharge({ consumableId: "c", contractType: "SALE", withinWarranty: true });
    expect(mockedPrisma.chargePolicy.findFirst).toHaveBeenCalledWith({
      where: { consumableId: "c", contractType: "SALE", withinWarranty: true },
      select: { isChargeable: true, notes: true },
    });
  });

  it("throws when neither part FK is set (F-MAINT-5 invariant)", async () => {
    await expect(
      decideCharge({ contractType: "RENTAL", withinWarranty: false }),
    ).rejects.toThrow(/exactly one of accessoryId or consumableId/);
    expect(mockedPrisma.chargePolicy.findFirst).not.toHaveBeenCalled();
  });

  it("propagates DB errors (does not silently swallow)", async () => {
    mockedPrisma.chargePolicy.findFirst.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      decideCharge({ accessoryId: "a", contractType: "SALE", withinWarranty: false }),
    ).rejects.toThrow("DB down");
  });
});

// F-TEST-1 — sweep all 6 default cells × 2 override outcomes. The original
// test suite covered only one OVERRIDE cell (RENTAL+accessory→true). This
// fills out the matrix so a refactor that breaks "override flips a charged
// default to free" doesn't slip through.
describe("decideCharge — full OVERRIDE × DEFAULT matrix sweep", () => {
  type Cell = {
    label: string;
    ctx: Parameters<typeof decideCharge>[0];
    defaultResult: boolean;
  };
  const cells: Cell[] = [
    {
      label: "RENTAL + accessory",
      ctx: { accessoryId: "a", contractType: "RENTAL", withinWarranty: false, isMinorPart: false },
      defaultResult: false,
    },
    {
      label: "RENTAL + consumable",
      ctx: { consumableId: "c", contractType: "RENTAL", withinWarranty: false },
      defaultResult: false,
    },
    {
      label: "SALE within warranty + accessory",
      ctx: { accessoryId: "a", contractType: "SALE", withinWarranty: true },
      defaultResult: false,
    },
    {
      label: "SALE after warranty + accessory",
      ctx: { accessoryId: "a", contractType: "SALE", withinWarranty: false },
      defaultResult: true,
    },
    {
      label: "MAINTENANCE + major accessory",
      ctx: { accessoryId: "a", contractType: "MAINTENANCE", withinWarranty: false, isMinorPart: false },
      defaultResult: true,
    },
    {
      label: "MAINTENANCE + consumable",
      ctx: { consumableId: "c", contractType: "MAINTENANCE", withinWarranty: false },
      defaultResult: false,
    },
  ];

  for (const { label, ctx, defaultResult } of cells) {
    it(`${label} — DEFAULT returns ${defaultResult}`, async () => {
      mockedPrisma.chargePolicy.findFirst.mockResolvedValueOnce(null);
      const r = await decideCharge(ctx);
      expect(r.source).toBe("DEFAULT");
      expect(r.isChargeable).toBe(defaultResult);
    });

    it(`${label} — OVERRIDE flips DEFAULT (${defaultResult} → ${!defaultResult})`, async () => {
      mockedPrisma.chargePolicy.findFirst.mockResolvedValueOnce({
        isChargeable: !defaultResult,
        notes: "test override",
      } as never);
      const r = await decideCharge(ctx);
      expect(r.source).toBe("OVERRIDE");
      expect(r.isChargeable).toBe(!defaultResult);
      expect(r.reason).toBe("test override");
    });
  }
});
