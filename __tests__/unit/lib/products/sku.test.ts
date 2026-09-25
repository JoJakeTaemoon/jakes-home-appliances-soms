import { describe, it, expect } from "vitest";
import {
  CONSUMABLE_SKU_PREFIX,
  formatSku,
  nextSku,
} from "@/lib/products/sku";

describe("nextSku", () => {
  it("starts at 000001 on an empty catalog", () => {
    expect(nextSku(CONSUMABLE_SKU_PREFIX, [])).toBe("FLT-000001");
  });

  it("continues from the numeric max", () => {
    expect(nextSku("FLT", ["FLT-000001", "FLT-000002"])).toBe("FLT-000003");
  });

  it("ignores the descriptive SKUs that share the prefix", () => {
    // These sort ABOVE every numeric one, so ORDER BY sku DESC would have
    // handed back a name instead of a number.
    const taken = ["FLT-AIR-HEPA-6", "FLT-UF-MEMB-9", "FLT-000007", "FLT-ICE-JBS"];
    expect(nextSku("FLT", taken)).toBe("FLT-000008");
  });

  it("does not trip over a gap or an out-of-order list", () => {
    expect(nextSku("FLT", ["FLT-000009", "FLT-000002"])).toBe("FLT-000010");
  });

  it("keeps counting past six digits instead of wrapping", () => {
    expect(nextSku("FLT", ["FLT-999999"])).toBe("FLT-1000000");
  });

  it("formats a sequence zero-padded", () => {
    expect(formatSku("ACC", 42)).toBe("ACC-000042");
  });
});
