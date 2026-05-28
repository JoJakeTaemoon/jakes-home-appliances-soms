import { describe, it, expect } from "vitest";
import {
  canTransitionSr,
  planSrTransition,
  IllegalSrTransitionError,
} from "@/lib/service-requests/state";

const NOW = new Date("2026-05-27T10:00:00.000Z");

describe("canTransitionSr", () => {
  it("allows PENDING_REVIEW → APPROVED", () => {
    expect(canTransitionSr("PENDING_REVIEW", "APPROVED")).toBe(true);
  });
  it("allows PENDING_REVIEW → REJECTED", () => {
    expect(canTransitionSr("PENDING_REVIEW", "REJECTED")).toBe(true);
  });
  it("allows PENDING_REVIEW → CANCELLED", () => {
    expect(canTransitionSr("PENDING_REVIEW", "CANCELLED")).toBe(true);
  });
  it("allows APPROVED → SCHEDULED", () => {
    expect(canTransitionSr("APPROVED", "SCHEDULED")).toBe(true);
  });
  it("allows SCHEDULED → COMPLETED", () => {
    expect(canTransitionSr("SCHEDULED", "COMPLETED")).toBe(true);
  });
  it("allows APPROVED → COMPLETED (free SR with auto-visit)", () => {
    expect(canTransitionSr("APPROVED", "COMPLETED")).toBe(true);
  });
  it("rejects PENDING_REVIEW → SCHEDULED (must approve first)", () => {
    expect(canTransitionSr("PENDING_REVIEW", "SCHEDULED")).toBe(false);
  });
  it("rejects PENDING_REVIEW → COMPLETED", () => {
    expect(canTransitionSr("PENDING_REVIEW", "COMPLETED")).toBe(false);
  });
  it("disallows COMPLETED → anything", () => {
    expect(canTransitionSr("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransitionSr("COMPLETED", "SCHEDULED")).toBe(false);
  });
  it("disallows REJECTED → anything", () => {
    expect(canTransitionSr("REJECTED", "APPROVED")).toBe(false);
    expect(canTransitionSr("REJECTED", "CANCELLED")).toBe(false);
  });
  it("disallows CANCELLED → anything", () => {
    expect(canTransitionSr("CANCELLED", "APPROVED")).toBe(false);
  });
});

describe("planSrTransition", () => {
  it("stamps decidedAt + decidedById when leaving PENDING_REVIEW", () => {
    const u = planSrTransition("PENDING_REVIEW", "APPROVED", {
      now: NOW,
      actorUserId: "user-1",
    });
    expect(u.state).toBe("APPROVED");
    expect(u.decidedAt).toEqual(NOW);
    expect(u.decidedById).toBe("user-1");
  });

  it("records rejectionReason on REJECTED", () => {
    const u = planSrTransition("PENDING_REVIEW", "REJECTED", {
      now: NOW,
      actorUserId: "user-1",
      rejectionReason: "out of scope",
    });
    expect(u.state).toBe("REJECTED");
    expect(u.rejectionReason).toBe("out of scope");
  });

  it("does NOT stamp decidedAt on APPROVED → SCHEDULED", () => {
    const u = planSrTransition("APPROVED", "SCHEDULED", { now: NOW });
    expect(u.state).toBe("SCHEDULED");
    expect(u.decidedAt).toBeUndefined();
  });

  it("throws IllegalSrTransitionError on a forbidden move", () => {
    expect(() => planSrTransition("COMPLETED", "APPROVED")).toThrow(
      IllegalSrTransitionError,
    );
  });

  it("allows customer cancellation when still PENDING_REVIEW", () => {
    const u = planSrTransition("PENDING_REVIEW", "CANCELLED", {
      now: NOW,
      actorUserId: null,
    });
    expect(u.state).toBe("CANCELLED");
    expect(u.decidedAt).toEqual(NOW);
  });
});
