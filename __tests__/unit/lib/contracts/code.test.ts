import { describe, it, expect } from "vitest";
import {
  allocateContractCode,
  formatContractCode,
  parseContractCode,
  formatVstDateStamp,
} from "@/lib/contracts/code";

const signedAt = new Date("2026-05-26T03:00:00.000Z"); // 10:00 VST

describe("formatVstDateStamp", () => {
  it("renders the VST calendar date even when the UTC date is the previous day", () => {
    // 2026-05-25T18:00Z is 2026-05-26 01:00 VST.
    expect(formatVstDateStamp(new Date("2026-05-25T18:00:00.000Z"))).toBe("20260526");
  });
  it("renders today's VST stamp for a daytime UTC time", () => {
    expect(formatVstDateStamp(signedAt)).toBe("20260526");
  });
});

describe("allocateContractCode (B2C)", () => {
  it("emits HD-YYYYmmDD/JH-KH##### for B2C customers", () => {
    const code = allocateContractCode({
      customer: { type: "B2C", code: "KH00001" },
      type: "SALE",
      signedAt,
    });
    expect(code).toBe("HD-20260526/JH-KH00001");
  });
  it("rejects B2B without shortcode", () => {
    expect(() =>
      allocateContractCode({
        customer: { type: "B2B", code: "KH00002", shortcode: null },
        type: "RENTAL",
        signedAt,
      }),
    ).toThrow();
  });
});

describe("allocateContractCode (B2B)", () => {
  it("emits HD-YYYYmmDD/JH-{shortcode}", () => {
    const code = allocateContractCode({
      customer: { type: "B2B", code: "KH00002", shortcode: "SHV" },
      type: "RENTAL",
      signedAt,
    });
    expect(code).toBe("HD-20260526/JH-SHV");
  });
});

describe("allocateContractCode (amendment)", () => {
  it("appends -A1 to the parent's code for first revision", () => {
    const code = allocateContractCode({
      customer: { type: "B2B", code: "KH00002", shortcode: "SHV" },
      parent: { contractNumber: "HD-20260526/JH-SHV", amendmentRevision: 0 },
    });
    expect(code).toBe("HD-20260526/JH-SHV-A1");
  });
  it("increments amendment revision", () => {
    const code = allocateContractCode({
      customer: { type: "B2B", code: "KH00002", shortcode: "SHV" },
      parent: { contractNumber: "HD-20260526/JH-SHV-A1", amendmentRevision: 1 },
    });
    expect(code).toBe("HD-20260526/JH-SHV-A2");
  });
  it("throws on malformed parent code", () => {
    expect(() =>
      allocateContractCode({
        customer: { type: "B2B", code: "KH00002", shortcode: "SHV" },
        parent: { contractNumber: "BOGUS", amendmentRevision: 0 },
      }),
    ).toThrow();
  });
});

describe("parseContractCode / formatContractCode", () => {
  it("round-trips an original code", () => {
    const parsed = parseContractCode("HD-20260526/JH-KH00001");
    expect(parsed).toEqual({
      dateStamp: "20260526",
      customerSuffix: "KH00001",
      isAmendment: false,
      amendmentRevision: 0,
    });
    expect(formatContractCode(parsed!)).toBe("HD-20260526/JH-KH00001");
  });
  it("round-trips an amendment code", () => {
    const parsed = parseContractCode("HD-20260526/JH-SHV-A2");
    expect(parsed).toEqual({
      dateStamp: "20260526",
      customerSuffix: "SHV",
      isAmendment: true,
      amendmentRevision: 2,
    });
    expect(formatContractCode(parsed!)).toBe("HD-20260526/JH-SHV-A2");
  });
  it("returns null on garbage", () => {
    expect(parseContractCode("not-a-code")).toBeNull();
    expect(parseContractCode("")).toBeNull();
  });
});
