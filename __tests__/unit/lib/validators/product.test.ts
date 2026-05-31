import { describe, it, expect } from "vitest";
import {
  createProductCategorySchema,
  createConsumableSchema,
  updateConsumableSchema,
  createAccessorySchema,
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

  it("accepts both cycles on one SKU (RO membrane)", () => {
    const res = createConsumableSchema.safeParse({
      ...base,
      replaceEveryMonths: 24,
      cleanEveryMonths: 6,
    });
    expect(res.success).toBe(true);
  });

  it("rejects when neither cycle is set", () => {
    const res = createConsumableSchema.safeParse(base);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes("replaceEveryMonths"))).toBe(true);
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

  it("rejects invalid SKU format", () => {
    expect(createAccessorySchema.safeParse({ ...base, sku: "ac mount" }).success).toBe(false);
  });
});
