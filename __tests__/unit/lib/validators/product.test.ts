import { describe, it, expect } from "vitest";
import {
  createProductCategorySchema,
  updateProductCategorySchema,
  createConsumableSchema,
  updateConsumableSchema,
  createAccessorySchema,
  updateAccessorySchema,
  createChargePolicySchema,
} from "@/lib/validators/product";

describe("createProductCategorySchema", () => {
  const base = {
    code: "WATER_PURIFIER",
    nameKo: "정수기",
    nameVi: "Máy lọc nước",
    nameEn: "Water purifier",
  };

  it("accepts a complete payload", () => {
    expect(createProductCategorySchema.safeParse(base).success).toBe(true);
  });

  it("rejects lowercase code", () => {
    expect(createProductCategorySchema.safeParse({ ...base, code: "water_purifier" }).success).toBe(false);
  });

  it("rejects empty names", () => {
    expect(createProductCategorySchema.safeParse({ ...base, nameKo: "" }).success).toBe(false);
  });
});

describe("createConsumableSchema", () => {
  const base = {
    sku: "FLT-RO-001",
    nameKo: "RO 멤브레인",
    nameVi: "Màng RO",
    nameEn: "RO Membrane",
    retailPrice: 350000,
  };

  it("accepts replace-only consumable", () => {
    const res = createConsumableSchema.safeParse({ ...base, replaceEveryMonths: 24 });
    expect(res.success).toBe(true);
  });

  it("accepts clean-only consumable", () => {
    const res = createConsumableSchema.safeParse({ ...base, cleanEveryMonths: 6 });
    expect(res.success).toBe(true);
  });

  it("accepts cleanOnEveryVisit-only consumable (pre-filter)", () => {
    const res = createConsumableSchema.safeParse({ ...base, cleanOnEveryVisit: true });
    expect(res.success).toBe(true);
  });

  it("accepts both cycles on one SKU (RO membrane)", () => {
    const res = createConsumableSchema.safeParse({
      ...base,
      replaceEveryMonths: 24,
      cleanEveryMonths: 6,
    });
    expect(res.success).toBe(true);
  });

  it("rejects when neither cycle nor cleanOnEveryVisit is set", () => {
    const res = createConsumableSchema.safeParse(base);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes("replaceEveryMonths"))).toBe(true);
    }
  });

  it("accepts compatibleModels with quantity", () => {
    const res = createConsumableSchema.safeParse({
      ...base,
      replaceEveryMonths: 12,
      compatibleModels: [{ modelId: "m1", quantity: 2 }],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.compatibleModels[0].quantity).toBe(2);
    }
  });

  it("defaults quantity to 1 when omitted in compatibleModels", () => {
    const res = createConsumableSchema.safeParse({
      ...base,
      replaceEveryMonths: 12,
      compatibleModels: [{ modelId: "m1" }],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.compatibleModels[0].quantity).toBe(1);
    }
  });

  it("rejects negative retail price", () => {
    expect(
      createConsumableSchema.safeParse({ ...base, replaceEveryMonths: 12, retailPrice: -1 }).success,
    ).toBe(false);
  });

  it("rejects monthsPolicy > 600 (50 years upper bound)", () => {
    expect(
      createConsumableSchema.safeParse({ ...base, replaceEveryMonths: 601 }).success,
    ).toBe(false);
  });
});

describe("updateConsumableSchema", () => {
  it("accepts partial updates (no cycle change)", () => {
    expect(updateConsumableSchema.safeParse({ notes: "new note" }).success).toBe(true);
  });

  it("accepts unsetting cleanEveryMonths via null", () => {
    expect(updateConsumableSchema.safeParse({ cleanEveryMonths: null }).success).toBe(true);
  });
});

describe("createAccessorySchema", () => {
  const base = {
    sku: "ACC-MOUNT-001",
    nameKo: "거치대",
    nameVi: "Giá đỡ",
    nameEn: "Mount",
    retailPrice: 120000,
  };

  it("accepts a complete payload", () => {
    expect(createAccessorySchema.safeParse(base).success).toBe(true);
  });

  it("defaults isMinorPart to false", () => {
    const res = createAccessorySchema.safeParse(base);
    if (res.success) {
      expect(res.data.isMinorPart).toBe(false);
    }
  });

  it("accepts isMinorPart=true (small parts)", () => {
    const res = createAccessorySchema.safeParse({ ...base, isMinorPart: true });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.isMinorPart).toBe(true);
    }
  });

  it("rejects invalid SKU format", () => {
    expect(createAccessorySchema.safeParse({ ...base, sku: "ac mount" }).success).toBe(false);
  });
});

describe("updateAccessorySchema (F-SEC-1 regression — mass-assignment via defaults)", () => {
  it("accepts empty object and does NOT reset isMinorPart or isActive", () => {
    const parsed = updateAccessorySchema.parse({});
    // Earlier shape was createAccessorySchema.partial() which kept .default(false)
    // on isMinorPart and .default(true) on isActive, so PATCH `{}` silently
    // flipped a chargeable MAINTENANCE part to free.
    expect(parsed.isMinorPart).toBeUndefined();
    expect(parsed.isActive).toBeUndefined();
    expect(parsed.compatibleModels).toBeUndefined();
  });

  it("accepts explicit isMinorPart=true", () => {
    const parsed = updateAccessorySchema.parse({ isMinorPart: true });
    expect(parsed.isMinorPart).toBe(true);
  });

  it("accepts explicit isActive=false (soft delete via PATCH)", () => {
    const parsed = updateAccessorySchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });
});

describe("createChargePolicySchema (superRefine invariants)", () => {
  const accessory = "acc-1";
  const consumable = "con-1";

  it("rejects when neither accessoryId nor consumableId is set", () => {
    const r = createChargePolicySchema.safeParse({
      contractType: "MAINTENANCE",
      withinWarranty: false,
      isChargeable: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects when BOTH accessoryId AND consumableId are set", () => {
    const r = createChargePolicySchema.safeParse({
      accessoryId: accessory,
      consumableId: consumable,
      contractType: "RENTAL",
      withinWarranty: false,
      isChargeable: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects withinWarranty=true for non-SALE contracts", () => {
    const rRental = createChargePolicySchema.safeParse({
      accessoryId: accessory,
      contractType: "RENTAL",
      withinWarranty: true,
      isChargeable: false,
    });
    expect(rRental.success).toBe(false);
    const rMaint = createChargePolicySchema.safeParse({
      consumableId: consumable,
      contractType: "MAINTENANCE",
      withinWarranty: true,
      isChargeable: false,
    });
    expect(rMaint.success).toBe(false);
  });

  it("accepts SALE + withinWarranty=true", () => {
    const r = createChargePolicySchema.safeParse({
      accessoryId: accessory,
      contractType: "SALE",
      withinWarranty: true,
      isChargeable: false,
    });
    expect(r.success).toBe(true);
  });

  it("accepts SALE + withinWarranty=false", () => {
    const r = createChargePolicySchema.safeParse({
      consumableId: consumable,
      contractType: "SALE",
      withinWarranty: false,
      isChargeable: true,
    });
    expect(r.success).toBe(true);
  });
});

describe("updateProductCategorySchema (red-team — mass-assignment via defaults)", () => {
  it("accepts empty object and does NOT reset isActive or sortOrder", () => {
    // Red-team finding: was createProductCategorySchema.partial() which kept
    // .default(true) on isActive and .default(0) on sortOrder — empty PATCH
    // un-soft-deleted and re-ranked the category silently.
    const parsed = updateProductCategorySchema.parse({});
    expect(parsed.isActive).toBeUndefined();
    expect(parsed.sortOrder).toBeUndefined();
    expect(parsed.code).toBeUndefined();
  });

  it("accepts explicit isActive=false (soft-delete via PATCH)", () => {
    const parsed = updateProductCategorySchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });
});
