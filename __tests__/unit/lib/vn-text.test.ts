import { describe, it, expect } from "vitest";
import { foldDiacritics } from "@/lib/vn-text";

describe("foldDiacritics", () => {
  it("strips Vietnamese tone/vowel marks and lowercases", () => {
    expect(foldDiacritics("Thành phố Hồ Chí Minh")).toBe("thanh pho ho chi minh");
  });

  it("maps đ/Đ to d", () => {
    expect(foldDiacritics("Đà Nẵng")).toBe("da nang");
    expect(foldDiacritics("Phường Đông Thạnh")).toBe("phuong dong thanh");
  });

  it("lets a plain-ASCII prefix match an accented string", () => {
    const haystack = foldDiacritics("Thành phố Hồ Chí Minh");
    expect(haystack.includes(foldDiacritics("Ho Chi"))).toBe(true);
    expect(haystack.includes(foldDiacritics("Tinh"))).toBe(false);
  });

  it("is a no-op for plain ASCII", () => {
    expect(foldDiacritics("Phuong 1")).toBe("phuong 1");
  });
});
