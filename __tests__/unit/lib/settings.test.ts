/**
 * System settings + scheduler weights accessor test.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    systemSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import prisma from "@/lib/prisma";
import {
  getSetting,
  setSetting,
  __resetSettingsCacheForTest,
  getSchedulerWeights,
  setSchedulerWeights,
  SCHEDULER_WEIGHTS_DEFAULT,
  getHqPhone,
  setHqPhone,
  hqPhoneTel,
  COMPANY_HQ_PHONE_DEFAULT,
  COMPANY_HQ_PHONE_KEY,
} from "@/lib/settings";

beforeEach(() => {
  vi.clearAllMocks();
  __resetSettingsCacheForTest();
});

describe("getSetting", () => {
  it("returns fallback when row missing", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    expect(await getSetting("any.key", "fallback")).toBe("fallback");
  });

  it("returns parsed JSON value when row present", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      { value: { foo: "bar" } },
    );
    expect(await getSetting<{ foo: string }>("k", { foo: "x" })).toEqual({
      foo: "bar",
    });
  });

  it("caches subsequent reads within TTL", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      { value: 1 },
    );
    await getSetting("k", 0);
    await getSetting("k", 0);
    expect(
      (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(1);
  });
});

describe("setSetting / scheduler weights", () => {
  it("upserts the row and invalidates the cache", async () => {
    await setSetting("k", { a: 1 }, "u1");
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: "k" },
      create: { key: "k", value: { a: 1 }, updatedById: "u1" },
      update: { value: { a: 1 }, updatedById: "u1" },
    });
  });

  it("getSchedulerWeights returns defaults when nothing stored", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    expect(await getSchedulerWeights()).toEqual(SCHEDULER_WEIGHTS_DEFAULT);
  });

  it("getSchedulerWeights merges partial stored value with defaults", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      { value: { preferred: 42 } },
    );
    const w = await getSchedulerWeights();
    expect(w.preferred).toBe(42);
    expect(w.regionMatch).toBe(SCHEDULER_WEIGHTS_DEFAULT.regionMatch);
    expect(w.loadPenaltyPerVisit).toBe(
      SCHEDULER_WEIGHTS_DEFAULT.loadPenaltyPerVisit,
    );
  });

  it("setSchedulerWeights writes the row", async () => {
    await setSchedulerWeights(
      { preferred: 1, regionMatch: 2, loadPenaltyPerVisit: 3 },
      "u1",
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalled();
  });
});

describe("HQ phone setting", () => {
  it("returns the HQ_PHONE constant default when nothing stored", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await getHqPhone()).toBe(COMPANY_HQ_PHONE_DEFAULT);
  });

  it("returns the stored override when present", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: "+84-90-000-1111",
    });
    expect(await getHqPhone()).toBe("+84-90-000-1111");
  });

  it("falls back to default for a blank/whitespace stored value", async () => {
    (prisma.systemSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: "   ",
    });
    expect(await getHqPhone()).toBe(COMPANY_HQ_PHONE_DEFAULT);
  });

  it("setHqPhone trims and upserts under the company.hqPhone key", async () => {
    await setHqPhone("  028-9999-0000  ", "admin1");
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: COMPANY_HQ_PHONE_KEY },
      create: { key: COMPANY_HQ_PHONE_KEY, value: "028-9999-0000", updatedById: "admin1" },
      update: { value: "028-9999-0000", updatedById: "admin1" },
    });
  });

  it("hqPhoneTel strips display formatting to dialable digits", () => {
    expect(hqPhoneTel("028-1234-5678")).toBe("02812345678");
    expect(hqPhoneTel("+84 (28) 1234-5678")).toBe("+842812345678");
  });
});
