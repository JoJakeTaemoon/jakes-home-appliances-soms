import { describe, expect, it } from "vitest";
import {
  brandListQuerySchema,
  createBrandSchema,
  updateBrandSchema,
} from "@/lib/validators/brand";

describe("createBrandSchema", () => {
  it("trims and accepts a normal name", () => {
    const parsed = createBrandSchema.parse({ name: "  Jake's Home Appliances  " });
    expect(parsed.name).toBe("Jake's Home Appliances");
    expect(parsed.isActive).toBe(true);
    expect(parsed.sortOrder).toBe(0);
  });

  it("rejects empty name", () => {
    expect(() => createBrandSchema.parse({ name: "" })).toThrow();
  });

  it("rejects name over 120 chars", () => {
    expect(() => createBrandSchema.parse({ name: "x".repeat(121) })).toThrow();
  });

  it("coerces sortOrder from string", () => {
    const parsed = createBrandSchema.parse({ name: "X", sortOrder: "5" });
    expect(parsed.sortOrder).toBe(5);
  });

  it("rejects sortOrder out of bounds", () => {
    expect(() => createBrandSchema.parse({ name: "X", sortOrder: -1 })).toThrow();
    expect(() => createBrandSchema.parse({ name: "X", sortOrder: 10000 })).toThrow();
  });
});

describe("updateBrandSchema (F-SEC-1 regression)", () => {
  it("accepts empty object and does NOT reset isActive or sortOrder", () => {
    const parsed = updateBrandSchema.parse({});
    // Mass-assignment regression: createBrandSchema.partial() previously
    // carried `.default(true)` / `.default(0)` through to PATCH, silently
    // resurrecting soft-deleted brands and resetting sortOrder.
    expect(parsed.isActive).toBeUndefined();
    expect(parsed.sortOrder).toBeUndefined();
    expect(parsed.name).toBeUndefined();
  });

  it("accepts a partial update without touching unspecified fields", () => {
    const parsed = updateBrandSchema.parse({ name: "DEWBEL" });
    expect(parsed.name).toBe("DEWBEL");
    expect(parsed.isActive).toBeUndefined();
    expect(parsed.sortOrder).toBeUndefined();
  });

  it("accepts explicit isActive=false", () => {
    const parsed = updateBrandSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
  });
});

describe("brandListQuerySchema", () => {
  it("applies pageSize cap of 500", () => {
    expect(() => brandListQuerySchema.parse({ pageSize: 501 })).toThrow();
    const parsed = brandListQuerySchema.parse({ pageSize: 500 });
    expect(parsed.pageSize).toBe(500);
  });

  it("defaults page=1 / pageSize=50", () => {
    const parsed = brandListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(50);
  });
});
