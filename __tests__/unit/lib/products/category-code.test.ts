import { describe, it, expect } from "vitest";
import {
  allocateCategoryCode,
  categoryCodeFromName,
} from "@/lib/products/category-code";

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

describe("allocateCategoryCode", () => {
  const takenBy = (codes: string[]) => async (code: string) =>
    codes.includes(code);

  it("returns the plain derivation when it is free", async () => {
    expect(await allocateCategoryCode("Dehumidifier", takenBy([]))).toBe(
      "DEHUMIDIFIER",
    );
  });

  it("suffixes on collision", async () => {
    expect(
      await allocateCategoryCode("Dehumidifier", takenBy(["DEHUMIDIFIER"])),
    ).toBe("DEHUMIDIFIER_2");
    expect(
      await allocateCategoryCode(
        "Dehumidifier",
        takenBy(["DEHUMIDIFIER", "DEHUMIDIFIER_2"]),
      ),
    ).toBe("DEHUMIDIFIER_3");
  });

  it("keeps Korean-only names apart instead of colliding on CATEGORY", async () => {
    // Korean yields no A-Z letters, so every such name derives CATEGORY —
    // without the suffix the second one would 409.
    expect(await allocateCategoryCode("정수기", takenBy([]))).toBe("CATEGORY");
    expect(await allocateCategoryCode("공기청정기", takenBy(["CATEGORY"]))).toBe(
      "CATEGORY_2",
    );
  });

  it("stays inside 30 characters once the suffix is appended", async () => {
    const long = "Hot and cold water purifier under sink";
    const base = categoryCodeFromName(long);
    const code = await allocateCategoryCode(long, takenBy([base]));
    expect(code.length).toBeLessThanOrEqual(30);
    expect(code).toMatch(/^[A-Z][A-Z0-9_]{1,29}$/);
    expect(code.endsWith("_2")).toBe(true);
  });
});
