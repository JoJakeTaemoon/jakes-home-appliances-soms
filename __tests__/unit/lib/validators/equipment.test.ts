import { describe, it, expect } from "vitest";
import {
  createEquipmentSchema,
  moveSiteSchema,
  replaceEquipmentSchema,
  filterPolicySchema,
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
  it("requires name (category + brand are optional)", () => {
    expect(
      createEquipmentModelSchema.safeParse({
        name: "Test",
        category: "WATER_PURIFIER",
      }).success,
    ).toBe(true);
  });

  it("accepts a model with no category or brand", () => {
    expect(
      createEquipmentModelSchema.safeParse({
        name: "Test",
      }).success,
    ).toBe(true);
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
