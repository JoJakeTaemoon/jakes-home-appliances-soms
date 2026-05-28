import { describe, it, expect } from "vitest";
import {
  canTransition,
  planTransition,
  IllegalStateTransitionError,
} from "@/lib/contracts/state";

const now = new Date("2026-05-26T08:00:00.000Z");

describe("canTransition", () => {
  it("allows DRAFT → PENDING_SIGNATURE", () => {
    expect(canTransition("DRAFT", "PENDING_SIGNATURE")).toBe(true);
  });
  it("allows PENDING_SIGNATURE → ACTIVE", () => {
    expect(canTransition("PENDING_SIGNATURE", "ACTIVE")).toBe(true);
  });
  it("disallows DRAFT → ACTIVE (skipping signature)", () => {
    expect(canTransition("DRAFT", "ACTIVE")).toBe(false);
  });
  it("disallows ACTIVE → DRAFT (no rollback)", () => {
    expect(canTransition("ACTIVE", "DRAFT")).toBe(false);
  });
  it("disallows transitions out of COMPLETED / TERMINATED / CANCELLED", () => {
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransition("TERMINATED", "ACTIVE")).toBe(false);
    expect(canTransition("CANCELLED", "DRAFT")).toBe(false);
  });
});

describe("planTransition", () => {
  it("sets activatedAt + signature timestamps on first activation", () => {
    const update = planTransition(
      { state: "PENDING_SIGNATURE" },
      "ACTIVE",
      { now },
    );
    expect(update.state).toBe("ACTIVE");
    expect(update.activatedAt).toEqual(now);
    expect(update.signedByCompanyAt).toEqual(now);
    expect(update.signedByCustomerAt).toEqual(now);
  });
  it("preserves prior signature timestamps when already set", () => {
    const prior = new Date("2026-04-01T00:00:00Z");
    const update = planTransition(
      {
        state: "PENDING_SIGNATURE",
        signedByCustomerAt: prior,
      },
      "ACTIVE",
      { now },
    );
    expect(update.signedByCustomerAt).toBeUndefined();
    expect(update.signedByCompanyAt).toEqual(now);
  });
  it("sets terminatedAt + reason on TERMINATED", () => {
    const update = planTransition(
      { state: "ACTIVE" },
      "TERMINATED",
      { now, reason: "Customer moved" },
    );
    expect(update.state).toBe("TERMINATED");
    expect(update.terminatedAt).toEqual(now);
    expect(update.terminationReason).toBe("Customer moved");
  });
  it("throws IllegalStateTransitionError on a disallowed move", () => {
    expect(() =>
      planTransition({ state: "DRAFT" }, "ACTIVE", { now }),
    ).toThrow(IllegalStateTransitionError);
  });
});
