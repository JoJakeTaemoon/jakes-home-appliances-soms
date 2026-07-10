import { describe, it, expect } from "vitest";
import {
  createEquipmentSchema,
  moveSiteSchema,
  replaceEquipmentSchema,
  filterPolicySchema,
  serviceConfigSchema,
  bulkRegisterEquipmentSchema,
  registerEquipmentSchema,
} from "@/lib/validators/equipment";
import {
  createEquipmentModelSchema,
  updateEquipmentModelSchema,
} from "@/lib/validators/equipmentModel";

describe("createEquipmentSchema", () => {
  it("accepts a minimal install payload", () => {
    const res = createEquipmentSchema.safeParse({
      customerId: "c1",
      modelId: "m1",
    });
    expect(res.success).toBe(true);
  });

  it("rejects missing customerId", () => {
    const res = createEquipmentSchema.safeParse({ modelId: "m1" });
    expect(res.success).toBe(false);
  });
});

describe("moveSiteSchema", () => {
  it("accepts null siteId (move to no-site)", () => {
    expect(moveSiteSchema.safeParse({ siteId: null }).success).toBe(true);
  });
  it("accepts a string siteId", () => {
    expect(moveSiteSchema.safeParse({ siteId: "s1" }).success).toBe(true);
  });
});

describe("replaceEquipmentSchema", () => {
  it("requires newModelId", () => {
    expect(replaceEquipmentSchema.safeParse({}).success).toBe(false);
    expect(replaceEquipmentSchema.safeParse({ newModelId: "m1" }).success).toBe(true);
  });
});

describe("filterPolicySchema", () => {
  it("accepts an empty filter list (defaults)", () => {
    const res = filterPolicySchema.safeParse({});
    expect(res.success).toBe(true);
    expect(res.data?.filters).toEqual([]);
  });

  it("accepts well-formed filters", () => {
    const res = filterPolicySchema.safeParse({
      filters: [{ type: "Sediment", replaceEveryDays: 90 }],
    });
    expect(res.success).toBe(true);
  });

  it("rejects negative replaceEveryDays", () => {
    const res = filterPolicySchema.safeParse({
      filters: [{ type: "Sediment", replaceEveryDays: -1 }],
    });
    expect(res.success).toBe(false);
  });
});

describe("createEquipmentModelSchema", () => {
  it("requires at least one localized name (category + brand are optional)", () => {
    expect(
      createEquipmentModelSchema.safeParse({
        nameVi: "Test",
        category: "WATER_PURIFIER",
      }).success,
    ).toBe(true);
  });

  it("accepts a model with no category or brand", () => {
    expect(
      createEquipmentModelSchema.safeParse({
        nameVi: "Test",
      }).success,
    ).toBe(true);
  });

  it("rejects a model with no localized name in any locale", () => {
    expect(
      createEquipmentModelSchema.safeParse({
        category: "WATER_PURIFIER",
      }).success,
    ).toBe(false);
  });
});

describe("serviceConfigSchema", () => {
  it("rejects a filter with both consumableId and customName", () => {
    const res = serviceConfigSchema.safeParse({
      filters: [
        { consumableId: "c1", customName: "Generic sediment", quantity: 1, useCycleDays: 90 },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a customName filter missing useCycleDays", () => {
    const res = serviceConfigSchema.safeParse({
      filters: [{ customName: "Generic sediment", quantity: 1 }],
    });
    expect(res.success).toBe(false);
  });

  it("accepts a valid consumableId filter", () => {
    const res = serviceConfigSchema.safeParse({
      filters: [{ consumableId: "c1", quantity: 2, useCycleDays: 180 }],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a valid customName filter with useCycleDays", () => {
    const res = serviceConfigSchema.safeParse({
      filters: [{ customName: "Generic sediment", quantity: 1, useCycleDays: 90 }],
    });
    expect(res.success).toBe(true);
  });

  it("rejects a filter with neither consumableId nor customName", () => {
    const res = serviceConfigSchema.safeParse({
      filters: [{ quantity: 1, useCycleDays: 90 }],
    });
    expect(res.success).toBe(false);
  });

  it("accepts inspectionCycleDays at the max bound (3600)", () => {
    const res = serviceConfigSchema.safeParse({ inspectionCycleDays: 3600, filters: [] });
    expect(res.success).toBe(true);
  });

  it("rejects inspectionCycleDays over the max bound (3601)", () => {
    const res = serviceConfigSchema.safeParse({ inspectionCycleDays: 3601, filters: [] });
    expect(res.success).toBe(false);
  });
});

describe("bulkRegisterEquipmentSchema — 4-step wizard fields", () => {
  const base = {
    customerId: "c1",
    modelId: "m1",
    defaultInstalledAt: "2026-07-10",
    rows: [{ installedAt: "2026-07-10" }],
  };

  it("accepts a rental payload (deposit + monthlyRent + contractTermMonths)", () => {
    const res = bulkRegisterEquipmentSchema.safeParse({
      ...base,
      serviceType: "RENTAL",
      deposit: 500000,
      monthlyRent: 150000,
      contractTermMonths: 36,
    });
    expect(res.success).toBe(true);
    expect(res.data?.deposit).toBe(500000);
    expect(res.data?.monthlyRent).toBe(150000);
    expect(res.data?.contractTermMonths).toBe(36);
  });

  it("accepts a sale payload (salePrice + installFee + hasContract)", () => {
    const res = bulkRegisterEquipmentSchema.safeParse({
      ...base,
      serviceType: "SALE",
      salePrice: 3000000,
      installFee: 100000,
      hasContract: true,
    });
    expect(res.success).toBe(true);
    expect(res.data?.salePrice).toBe(3000000);
    expect(res.data?.installFee).toBe(100000);
    expect(res.data?.hasContract).toBe(true);
  });

  it("accepts contractNumber + serviceConfig on the wizard payload", () => {
    const res = bulkRegisterEquipmentSchema.safeParse({
      ...base,
      serviceType: "SALE",
      salePrice: 3000000,
      contractNumber: "HD-20260710/SA-KH0001",
      serviceConfig: {
        inspectionCycleDays: 180,
        filters: [{ consumableId: "c1", quantity: 1, useCycleDays: 90 }],
      },
    });
    expect(res.success).toBe(true);
    expect(res.data?.contractNumber).toBe("HD-20260710/SA-KH0001");
    expect(res.data?.serviceConfig?.inspectionCycleDays).toBe(180);
    expect(res.data?.serviceConfig?.filters).toHaveLength(1);
    expect(res.data?.serviceConfig?.filters[0]).toMatchObject({
      consumableId: "c1",
      quantity: 1,
      useCycleDays: 90,
    });
  });

  it("rejects a negative salePrice", () => {
    const res = bulkRegisterEquipmentSchema.safeParse({
      ...base,
      serviceType: "SALE",
      salePrice: -1,
    });
    expect(res.success).toBe(false);
  });

  it("rejects a SALE payload with no salePrice (silent price loss guard)", () => {
    const res = bulkRegisterEquipmentSchema.safeParse({
      ...base,
      serviceType: "SALE",
      monthlyFee: 200000, // old-UI shape — must not be treated as the price
    });
    expect(res.success).toBe(false);
    expect(
      res.success ? [] : res.error.issues.some((i) => i.path.includes("salePrice")),
    ).toBe(true);
  });

  it("accepts a SALE payload with salePrice=0 (free unit is valid)", () => {
    const res = bulkRegisterEquipmentSchema.safeParse({
      ...base,
      serviceType: "SALE",
      salePrice: 0,
    });
    expect(res.success).toBe(true);
    expect(res.data?.salePrice).toBe(0);
  });
});

describe("registerEquipmentSchema — per-line SALE requires salePrice", () => {
  const baseLine = {
    customerId: "c1",
    defaultInstalledAt: "2026-07-10",
  };

  it("rejects a SALE line with no salePrice (silent price loss guard)", () => {
    const res = registerEquipmentSchema.safeParse({
      ...baseLine,
      lines: [
        {
          modelId: "m1",
          serviceType: "SALE",
          quantity: 1,
          monthlyFee: 200000, // old-UI shape — must not be treated as the price
        },
      ],
    });
    expect(res.success).toBe(false);
    expect(
      res.success ? [] : res.error.issues.some((i) => i.path.includes("salePrice")),
    ).toBe(true);
  });

  it("accepts a SALE line with salePrice=0 (free unit is valid)", () => {
    const res = registerEquipmentSchema.safeParse({
      ...baseLine,
      lines: [
        {
          modelId: "m1",
          serviceType: "SALE",
          quantity: 1,
          salePrice: 0,
        },
      ],
    });
    expect(res.success).toBe(true);
    expect(res.data?.lines[0].salePrice).toBe(0);
  });

  it("accepts a SALE line with a positive salePrice", () => {
    const res = registerEquipmentSchema.safeParse({
      ...baseLine,
      lines: [
        {
          modelId: "m1",
          serviceType: "SALE",
          quantity: 1,
          salePrice: 3000000,
        },
      ],
    });
    expect(res.success).toBe(true);
  });
});

describe("updateEquipmentModelSchema (red-team — mass-assignment via defaults)", () => {
  it("accepts empty object and does NOT reset isActive", () => {
    // Red-team finding: was createEquipmentModelSchema.partial() which kept
    // .default(true) on isActive — empty PATCH un-soft-deleted a retired
    // model, putting it back on technician model lists and admin filters.
    const parsed = updateEquipmentModelSchema.parse({});
    expect(parsed.isActive).toBeUndefined();
    expect(parsed.nameKo).toBeUndefined();
    expect(parsed.brandId).toBeUndefined();
  });

  it("accepts explicit isActive=false (soft-delete via PATCH)", () => {
    const parsed = updateEquipmentModelSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });

  it("accepts a single-field name update", () => {
    const parsed = updateEquipmentModelSchema.parse({ nameKo: "Renamed model" });
    expect(parsed.nameKo).toBe("Renamed model");
    expect(parsed.isActive).toBeUndefined();
  });

  it("accepts brandId=null (clear) via PATCH", () => {
    const parsed = updateEquipmentModelSchema.parse({ brandId: null });
    expect(parsed.brandId).toBeNull();
  });
});
