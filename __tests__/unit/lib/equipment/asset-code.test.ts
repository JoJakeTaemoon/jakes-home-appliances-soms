import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";
import {
  ASSET_CODE_PREFIX,
  formatAssetCode,
  allocateAssetCodes,
} from "@/lib/equipment/asset-code";

/**
 * Minimal stand-in for the interactive transaction client. `existing` is the
 * whole table as (modelId, assetCode) pairs; the stub filters by both the way
 * Prisma would, so a code belonging to another model must not be seen.
 */
function stubTx(existing: Array<{ modelId: string | null; assetCode: string }>) {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    equipment: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { modelId: string | null; assetCode: { startsWith: string } };
        }) =>
          existing.filter(
            (r) =>
              r.modelId === where.modelId &&
              r.assetCode.startsWith(where.assetCode.startsWith),
          ),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("formatAssetCode", () => {
  it("is MAY- plus a 6-digit sequence", () => {
    expect(formatAssetCode(1)).toBe("MAY-000001");
    expect(formatAssetCode(42)).toBe("MAY-000042");
    expect(formatAssetCode(999999)).toBe("MAY-999999");
  });

  it("exposes the prefix it uses", () => {
    expect(formatAssetCode(1).startsWith(ASSET_CODE_PREFIX)).toBe(true);
  });
});

describe("allocateAssetCodes", () => {
  it("starts a fresh model at MAY-000001 and runs consecutively", async () => {
    const codes = await allocateAssetCodes(stubTx([]), "model-a", 3);
    expect(codes).toEqual(["MAY-000001", "MAY-000002", "MAY-000003"]);
  });

  it("continues past the highest code that model already holds", async () => {
    const tx = stubTx([
      { modelId: "model-a", assetCode: "MAY-000001" },
      { modelId: "model-a", assetCode: "MAY-000002" },
    ]);
    expect(await allocateAssetCodes(tx, "model-a", 1)).toEqual(["MAY-000003"]);
  });

  it("sequences per model — another model's codes never advance this one", async () => {
    const tx = stubTx([
      { modelId: "model-a", assetCode: "MAY-000001" },
      { modelId: "model-a", assetCode: "MAY-000002" },
      { modelId: "model-a", assetCode: "MAY-000003" },
    ]);
    // model-b has nothing of its own, so it starts over — the same string
    // model-a already uses. That duplication is the point of the rule.
    expect(await allocateAssetCodes(tx, "model-b", 1)).toEqual(["MAY-000001"]);
  });

  it("gives off-catalog units (modelId null) their own sequence", async () => {
    const tx = stubTx([
      { modelId: "model-a", assetCode: "MAY-000009" },
      { modelId: null, assetCode: "MAY-000001" },
    ]);
    expect(await allocateAssetCodes(tx, null, 2)).toEqual([
      "MAY-000002",
      "MAY-000003",
    ]);
  });

  it("takes an advisory lock so parallel registrations can't read the same max", async () => {
    const tx = stubTx([]);
    await allocateAssetCodes(tx, "model-a", 1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("ignores legacy non-conforming codes on the same model", async () => {
    const tx = stubTx([
      { modelId: "model-a", assetCode: "MAY-00000X" },
      { modelId: "model-a", assetCode: "MAY-000004" },
    ]);
    expect(await allocateAssetCodes(tx, "model-a", 1)).toEqual(["MAY-000005"]);
  });

  it("allocates nothing for a zero count", async () => {
    const tx = stubTx([]);
    expect(await allocateAssetCodes(tx, "model-a", 0)).toEqual([]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
