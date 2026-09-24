import { describe, it, expect } from "vitest";
import { categoryCodeFromName } from "@/lib/products/category-code";

describe("categoryCodeFromName", () => {
  it("upper-snake-cases a plain English name", () => {
    expect(categoryCodeFromName("Home dehumidifier")).toBe("HOME_DEHUMIDIFIER");
  });

  it("folds Vietnamese diacritics instead of dropping the letters", () => {
    expect(categoryCodeFromName("Máy lọc nước")).toBe("MAY_LOC_NUOC");
    expect(categoryCodeFromName("Bồn cầu thông minh")).toBe("BON_CAU_THONG_MINH");
    expect(categoryCodeFromName("Máy hút ẩm")).toBe("MAY_HUT_AM");
  });

  it("maps đ / Đ to d", () => {
    expect(categoryCodeFromName("Điều hòa")).toBe("DIEU_HOA");
  });

  it("collapses punctuation runs and trims the edges", () => {
    expect(categoryCodeFromName("  RO / hot-cold purifier!! ")).toBe("RO_HOT_COLD_PURIFIER");
  });

  it("falls back to CATEGORY when nothing survives (e.g. Korean-only input)", () => {
    expect(categoryCodeFromName("정수기")).toBe("CATEGORY");
    expect(categoryCodeFromName("")).toBe("CATEGORY");
  });
});
