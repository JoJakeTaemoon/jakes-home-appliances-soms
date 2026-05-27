import { describe, it, expect } from "vitest";
import {
  formatCustomerCode,
  parseCustomerCode,
  allocateCustomerCode,
} from "@/lib/customers/code";

describe("customer code helpers", () => {
  it("formats codes with 5-digit padding", () => {
    expect(formatCustomerCode(1)).toBe("KH00001");
    expect(formatCustomerCode(42)).toBe("KH00042");
    expect(formatCustomerCode(99999)).toBe("KH99999");
  });

  it("rejects out-of-range numbers", () => {
    expect(() => formatCustomerCode(0)).toThrow();
    expect(() => formatCustomerCode(100_000)).toThrow();
    expect(() => formatCustomerCode(-1)).toThrow();
  });

  it("parses valid codes back to numbers", () => {
    expect(parseCustomerCode("KH00001")).toBe(1);
    expect(parseCustomerCode("KH99999")).toBe(99999);
  });

  it("rejects invalid codes when parsing", () => {
    expect(parseCustomerCode("kh00001")).toBeNull();
    expect(parseCustomerCode("KH123")).toBeNull();
    expect(parseCustomerCode("KH000001")).toBeNull();
    expect(parseCustomerCode("LEGACY-123")).toBeNull();
    expect(parseCustomerCode("")).toBeNull();
  });

  it("allocateCustomerCode returns max+1 from existing codes", async () => {
    const fake = {
      customer: {
        findMany: async () => [
          { code: "KH00001" },
          { code: "KH00005" },
          { code: "KH00003" },
          { code: "LEGACY-X" }, // ignored
        ],
      },
    } as unknown as Parameters<typeof allocateCustomerCode>[0];
    expect(await allocateCustomerCode(fake)).toBe("KH00006");
  });

  it("allocateCustomerCode returns KH00001 when table empty", async () => {
    const fake = {
      customer: {
        findMany: async () => [],
      },
    } as unknown as Parameters<typeof allocateCustomerCode>[0];
    expect(await allocateCustomerCode(fake)).toBe("KH00001");
  });
});
