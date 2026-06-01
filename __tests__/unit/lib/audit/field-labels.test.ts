/**
 * RED — field name → localised label, with 3-step fallback:
 *   1. entityType-scoped (e.g. Customer.preferredTechnicianId)
 *   2. common (e.g. createdAt, updatedAt, active)
 *   3. camelCase humaniser (preferredTechnicianId → "Preferred technician id")
 */

import { describe, it, expect } from "vitest";
import { getFieldLabel } from "@/lib/audit/field-labels";

describe("getFieldLabel — entity-scoped", () => {
  it("returns Korean label for Customer.preferredTechnicianId", () => {
    expect(getFieldLabel("Customer", "preferredTechnicianId", "ko")).toMatch(
      /선호|주관|담당.*기사|기사/,
    );
  });

  it("returns English label for Contract.state", () => {
    expect(getFieldLabel("Contract", "state", "en").toLowerCase()).toMatch(
      /status|state/,
    );
  });

  it("returns Vietnamese label for Visit.scheduledAt", () => {
    const out = getFieldLabel("Visit", "scheduledAt", "vi");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("getFieldLabel — common fields", () => {
  it("handles createdAt across all locales", () => {
    expect(getFieldLabel("Customer", "createdAt", "ko")).toMatch(/생성|등록/);
    expect(getFieldLabel("Customer", "createdAt", "en").toLowerCase()).toContain(
      "created",
    );
    expect(getFieldLabel("Customer", "createdAt", "vi").toLowerCase()).toMatch(
      /tạo|ngày/,
    );
  });

  it("handles boolean-ish 'active' field", () => {
    expect(getFieldLabel("Customer", "active", "ko")).toMatch(/활성|사용|운영/);
  });
});

describe("getFieldLabel — fallback humaniser", () => {
  it("humanises unknown camelCase field name", () => {
    const out = getFieldLabel("Unknown", "preferredTechnicianId", "en");
    // expect spaces inserted, no trailing camelCase clump
    expect(out).toMatch(/[Pp]referred [Tt]echnician/);
  });

  it("humanises single-word unknown field", () => {
    expect(getFieldLabel("Unknown", "foo", "en")).toBe("Foo");
  });

  it("returns the raw key as a last resort if input is empty-ish", () => {
    expect(getFieldLabel("Unknown", "", "en")).toBe("");
  });
});
