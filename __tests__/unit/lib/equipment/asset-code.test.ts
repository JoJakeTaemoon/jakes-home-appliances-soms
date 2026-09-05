import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";
import { assetCodePrefix, allocateAssetCodes } from "@/lib/equipment/asset-code";

/** Minimal stand-in for the interactive transaction client the allocator uses. */
function stubTx(existing: string[]) {
  const rows = existing.map((assetCode) => ({ assetCode }));
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    equipment: {
      findMany: vi.fn(
        async ({ where }: { where: { assetCode: { startsWith: string } } }) =>
          rows.filter((r) => r.assetCode.startsWith(where.assetCode.startsWith)),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

const install = new Date("2026-09-04T00:00:00.000Z");

describe("assetCodePrefix", () => {
  it("is {modelCode}{YYMMDD}", () => {
    expect(assetCodePrefix("PTS2100", install)).toBe("PTS2100260904");
  });

  it("uses the VST calendar day, not UTC", () => {
    // 2026-09-03T18:00Z is 2026-09-04 01:00 in Vietnam.
    expect(assetCodePrefix("PTS2100", new Date("2026-09-03T18:00:00.000Z"))).toBe(
      "PTS2100260904",
    );
  });

  it("falls back to AQS for off-catalog / code-less models", () => {
    expect(assetCodePrefix(null, install)).toBe("AQS260904");
    expect(assetCodePrefix("  ", install)).toBe("AQS260904");
  });
});

describe("allocateAssetCodes", () => {
  it("starts at 0001 when the prefix is unused", async () => {
    const codes = await allocateAssetCodes(stubTx([]), "PTS2100", [install, install]);
    expect(codes).toEqual(["PTS21002609040001", "PTS21002609040002"]);
  });

  it("continues past the highest code already taken on that prefix", async () => {
    const tx = stubTx(["PTS21002609040001", "PTS21002609040002"]);
    expect(await allocateAssetCodes(tx, "PTS2100", [install])).toEqual([
      "PTS21002609040003",
    ]);
  });

  it("takes an advisory lock so parallel registrations can't read the same max", async () => {
    const tx = stubTx([]);
    await allocateAssetCodes(tx, "PTS2100", [install]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("sequences per install date, keeping the input order", async () => {
    const later = new Date("2026-09-05T00:00:00.000Z");
    const codes = await allocateAssetCodes(stubTx([]), "PTS2100", [
      install,
      later,
      install,
    ]);
    expect(codes).toEqual([
      "PTS21002609040001",
      "PTS21002609050001",
      "PTS21002609040002",
    ]);
  });

  it("ignores other models' codes and legacy non-numeric suffixes", async () => {
    const tx = stubTx(["BID50002609040009", "PTS2100260904WA-1", "PTS21002609040004"]);
    expect(await allocateAssetCodes(tx, "PTS2100", [install])).toEqual([
      "PTS21002609040005",
    ]);
  });
});
