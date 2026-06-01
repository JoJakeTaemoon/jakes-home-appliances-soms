/**
 * RED — action code → human verb label resolver.
 *
 * Catalog covers ~80 known codes (ko/en/vi). Unknown codes are NOT hidden:
 * `getActionLabel()` returns `{ verb, isUnknown: true }` with a verb derived
 * from the last token (CREATE/UPDATE/DELETE/STATE/ENABLE/DISABLE/MERGE/RUN/
 * BREACH/COMPLETE/CANCEL/...) and an `entityHint` from the prefix.
 */

import { describe, it, expect } from "vitest";
import { getActionLabel } from "@/lib/audit/labels";

describe("getActionLabel — known codes", () => {
  it("returns Korean verb for CUSTOMER_CREATE", () => {
    const out = getActionLabel("CUSTOMER_CREATE", "ko");
    expect(out.isUnknown).toBe(false);
    expect(out.verb).toMatch(/생성|등록|만들/);
  });

  it("returns English verb for CUSTOMER_CREATE", () => {
    const out = getActionLabel("CUSTOMER_CREATE", "en");
    expect(out.isUnknown).toBe(false);
    expect(out.verb.toLowerCase()).toMatch(/create|register|added|add/);
  });

  it("returns Vietnamese verb for CUSTOMER_CREATE", () => {
    const out = getActionLabel("CUSTOMER_CREATE", "vi");
    expect(out.isUnknown).toBe(false);
    expect(out.verb.toLowerCase()).toMatch(/tạo|thêm|đăng/);
  });

  it("handles login/logout codes (no entity)", () => {
    const login = getActionLabel("LOGIN_SUCCESS", "ko");
    expect(login.isUnknown).toBe(false);
    expect(login.verb).toBeTruthy();

    const logout = getActionLabel("LOGOUT", "ko");
    expect(logout.isUnknown).toBe(false);
    expect(logout.verb).toBeTruthy();
  });

  it("covers contract / visit / payment families", () => {
    const codes = [
      "CONTRACT_CREATE",
      "CONTRACT_AMEND",
      "VISIT_COMPLETE",
      "VISIT_CANCEL",
      "PAYMENT_COLLECT_CASH",
      "USER_CREATE",
      "USER_DISABLE",
    ];
    for (const code of codes) {
      const out = getActionLabel(code, "ko");
      expect(out.isUnknown).toBe(false);
      expect(out.verb.length).toBeGreaterThan(0);
    }
  });
});

describe("getActionLabel — unknown codes", () => {
  it("returns isUnknown=true and fallback verb from last token (UPDATE)", () => {
    const out = getActionLabel("FOO_BAR_BAZ_UPDATE", "ko");
    expect(out.isUnknown).toBe(true);
    expect(out.verb).toMatch(/수정|변경|업데이트/);
  });

  it("falls back for CREATE last token (en)", () => {
    const out = getActionLabel("WIDGET_CREATE", "en");
    expect(out.isUnknown).toBe(true);
    expect(out.verb.toLowerCase()).toMatch(/create|add/);
  });

  it("falls back for DELETE last token (vi)", () => {
    const out = getActionLabel("WIDGET_DELETE", "vi");
    expect(out.isUnknown).toBe(true);
    expect(out.verb.toLowerCase()).toMatch(/xoá|xóa|gỡ/);
  });

  it("returns a verb even with unrecognised last token", () => {
    const out = getActionLabel("NEW_FOO_QUUX", "ko");
    expect(out.isUnknown).toBe(true);
    expect(out.verb.length).toBeGreaterThan(0);
  });

  it("exposes an entityHint derived from the prefix when present", () => {
    const out = getActionLabel("WIDGET_CREATE", "en");
    expect(out.entityHint).toBeDefined();
    expect((out.entityHint ?? "").toLowerCase()).toContain("widget");
  });

  it("falls back to ko if locale unsupported", () => {
    const out = getActionLabel("CUSTOMER_CREATE", "pt" as unknown as "ko");
    expect(out.verb.length).toBeGreaterThan(0);
  });
});
