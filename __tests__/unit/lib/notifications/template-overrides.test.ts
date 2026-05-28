/**
 * DB template override cache tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    notificationTemplate: { findUnique: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  getOverride,
  clearOverrideCache,
} from "@/lib/notifications/template-overrides";

beforeEach(() => {
  vi.clearAllMocks();
  clearOverrideCache();
});

describe("template-overrides.getOverride", () => {
  it("returns null when no row exists + caches null", async () => {
    (
      prisma.notificationTemplate.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    expect(await getOverride("SMS_PORTAL_WELCOME", "vi")).toBeNull();
    // second call should hit cache
    expect(await getOverride("SMS_PORTAL_WELCOME", "vi")).toBeNull();
    expect(
      (prisma.notificationTemplate.findUnique as ReturnType<typeof vi.fn>).mock
        .calls.length,
    ).toBe(1);
  });

  it("returns the row body/subject when present", async () => {
    (
      prisma.notificationTemplate.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ body: "hello", subject: "hi" });
    const out = await getOverride("EMAIL_RECEIPT", "vi");
    expect(out).toEqual({ body: "hello", subject: "hi" });
  });

  it("clearOverrideCache() forces a re-fetch", async () => {
    const finder = prisma.notificationTemplate.findUnique as ReturnType<
      typeof vi.fn
    >;
    finder.mockResolvedValue({ body: "one", subject: null });
    await getOverride("SMS_PORTAL_WELCOME", "vi");
    clearOverrideCache();
    finder.mockResolvedValue({ body: "two", subject: null });
    const out = await getOverride("SMS_PORTAL_WELCOME", "vi");
    expect(out?.body).toBe("two");
    expect(finder.mock.calls.length).toBe(2);
  });

  it("degrades to null when the DB call throws", async () => {
    (
      prisma.notificationTemplate.findUnique as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("DB unreachable"));
    expect(await getOverride("SMS_PORTAL_WELCOME", "vi")).toBeNull();
  });
});
