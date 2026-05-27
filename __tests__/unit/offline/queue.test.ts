/**
 * Offline queue unit test — exercises Dexie against a fake-indexeddb backend.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import "fake-indexeddb/auto";

import { describe, it, expect, beforeEach } from "vitest";

import { enqueue, flush, listPending, clearAll } from "@/lib/offline/queue";

beforeEach(async () => {
  await clearAll();
});

describe("offline queue", () => {
  it("enqueues a pending action and lists it", async () => {
    const id = await enqueue({
      kind: "VISIT_COMPLETE",
      payload: { hello: "world" },
      visitId: "v1",
    });
    expect(id).toBeGreaterThan(0);
    const rows = await listPending();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("VISIT_COMPLETE");
    expect(rows[0].visitId).toBe("v1");
    expect(rows[0].attempts).toBe(0);
  });

  it("flush() runs the sender per action and removes succeeded rows", async () => {
    await enqueue({ kind: "VISIT_COMPLETE", payload: { a: 1 }, visitId: "v1" });
    await enqueue({ kind: "VISIT_NOTES", payload: { b: 2 }, visitId: "v2" });
    const seen: string[] = [];
    const result = await flush(async (a) => {
      seen.push(a.kind);
    });
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(seen.sort()).toEqual(["VISIT_COMPLETE", "VISIT_NOTES"]);
    expect(await listPending()).toHaveLength(0);
  });

  it("increments attempts + records lastError when sender throws", async () => {
    await enqueue({ kind: "VISIT_COMPLETE", payload: {}, visitId: "v1" });
    const result = await flush(async () => {
      throw new Error("network down");
    });
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.remaining).toBe(1);
    const rows = await listPending();
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toBe("network down");
  });

  it("stops re-attempting rows past the max retry limit", async () => {
    // Pre-populate a row with attempts already > MAX_ATTEMPTS by failing 5 times
    await enqueue({ kind: "VISIT_COMPLETE", payload: {}, visitId: "v1" });
    for (let i = 0; i < 5; i++) {
      await flush(async () => {
        throw new Error("nope");
      });
    }
    // 6th call: row's attempts is 5 → eligible filter excludes it
    const result = await flush(async () => {
      // Should never be called
      throw new Error("should not be called");
    });
    expect(result.attempted).toBe(0);
    expect(result.remaining).toBe(1);
  });
});
