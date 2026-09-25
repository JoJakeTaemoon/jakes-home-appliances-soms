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

  it("stays inside the 30-char code limit", () => {
    // The API regex caps the code at 30 characters; a long name has to be cut
    // here or the form bounces off it as "Invalid body".
    const code = categoryCodeFromName("Hot and cold water purifier under sink");
    expect(code.length).toBeLessThanOrEqual(30);
    expect(code).toBe("HOT_AND_COLD_WATER_PURIFIER_UN");
    expect(code).toMatch(/^[A-Z][A-Z0-9_]{1,29}$/);
  });

  it("never ends on a trailing underscore after the cut", () => {
    const code = categoryCodeFromName("Hot and cold water purifier a b c");
    expect(code.endsWith("_")).toBe(false);
    expect(code).toMatch(/^[A-Z][A-Z0-9_]{1,29}$/);
  });

  it("falls back to CATEGORY when nothing survives (e.g. Korean-only input)", () => {
    expect(categoryCodeFromName("정수기")).toBe("CATEGORY");
    expect(categoryCodeFromName("")).toBe("CATEGORY");
  });
});
