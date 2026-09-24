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

/**
 * Catalog actions used to be missing from the curated catalog, so every
 * 제품 카탈로그 row rendered with the amber "(미등록)" marker — which reads
 * like the action was never recorded. These stay registered in all three
 * locales.
 */
describe("getActionLabel — product catalog codes are registered", () => {
  const CODES = [
    "BRAND_CREATE",
    "PRODUCT_CATEGORY_CREATE",
    "CONSUMABLE_CREATE",
    "ACCESSORY_CREATE",
    "CHARGE_POLICY_UPSERT",
    "EQUIPMENT_MODEL_CREATE",
    "EQUIPMENT_MODEL_DEACTIVATE",
    "EQUIPMENT_MODEL_REACTIVATE",
    "CATALOG_IMPORT",
  ] as const;

  for (const code of CODES) {
    it(`${code} resolves in ko/en/vi without the unknown marker`, () => {
      for (const locale of ["ko", "en", "vi"] as const) {
        const out = getActionLabel(code, locale);
        expect(out.isUnknown, `${code} @ ${locale}`).toBe(false);
        expect(out.verb.length).toBeGreaterThan(0);
      }
    });
  }
});

/**
 * Guard against the catalog drifting behind the routes again: every action
 * string a route emits must resolve to a curated label. The list mirrors
 * `grep -rhoE 'action: "[A-Z_]+"' src/` at the time of writing.
 */
describe("getActionLabel — every emitted action code is registered", () => {
  const EMITTED = [
    "CONTRACT_COMPLETED_AUTO",
    "CONTRACT_CONVERT",
    "CONTRACT_NOTIFY_RENEWAL",
    "CONTRACT_PDF_UPLOADED",
    "CONTRACT_RETRIEVAL_VISIT_AUTO",
    "CONTRACT_TERMINATE",
    "CUSTOMER_CONTACT_CREATE",
    "CUSTOMER_SALES_REP_CHANGED",
    "EQUIPMENT_BULK_CREATE",
    "EQUIPMENT_BULK_INSTALL",
    "EQUIPMENT_CONSUMABLE_ADD",
    "EQUIPMENT_CONSUMABLE_REMOVE",
    "EQUIPMENT_CONSUMABLE_UPDATE",
    "EQUIPMENT_INSTALL",
    "EQUIPMENT_RETRIEVAL_LOGGED",
    "MIGRATION_EXPORTED",
    "MIGRATION_IMPORTED",
    "ORDER_CREATE",
    "PAYMENT_UPDATED",
    "SITE_CREATE",
    "STOCK_MOVE",
    "VISIT_CHARGE_OVERRIDE",
  ] as const;

  it("resolves all of them without the unknown marker", () => {
    const unregistered = EMITTED.filter((code) => getActionLabel(code, "ko").isUnknown);
    expect(unregistered).toEqual([]);
  });
});
