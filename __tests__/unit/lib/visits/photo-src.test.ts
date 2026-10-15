import { describe, it, expect } from "vitest";
import { photoSrc } from "@/lib/visits/photo-src";

describe("photoSrc", () => {
  it("keeps an explicit url (seed / legacy rows)", () => {
    expect(photoSrc({ url: "/sample-images/1.png" })).toBe("/sample-images/1.png");
  });
  it("maps an uploaded storageKey to the served /uploads path", () => {
    expect(photoSrc({ storageKey: "uploads/visits/v1/1700-a.jpg" })).toBe("/uploads/visits/v1/1700-a.jpg");
  });
  it("returns null for entries with neither", () => {
    expect(photoSrc({})).toBeNull();
    expect(photoSrc(null)).toBeNull();
    expect(photoSrc("x")).toBeNull();
  });
});
