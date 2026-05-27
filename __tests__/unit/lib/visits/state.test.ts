import { describe, it, expect } from "vitest";
import {
  canTransitionVisit,
  planVisitTransition,
  IllegalVisitTransitionError,
} from "@/lib/visits/state";

const now = new Date("2026-06-15T14:00:00.000Z");

describe("canTransitionVisit", () => {
  it("allows SUGGESTED → SCHEDULED", () => {
    expect(canTransitionVisit("SUGGESTED", "SCHEDULED")).toBe(true);
  });
  it("allows SCHEDULED → IN_PROGRESS", () => {
    expect(canTransitionVisit("SCHEDULED", "IN_PROGRESS")).toBe(true);
  });
  it("allows IN_PROGRESS → COMPLETED", () => {
    expect(canTransitionVisit("IN_PROGRESS", "COMPLETED")).toBe(true);
  });
  it("disallows SUGGESTED → COMPLETED (skipping schedule + progress)", () => {
    expect(canTransitionVisit("SUGGESTED", "COMPLETED")).toBe(false);
  });
  it("disallows COMPLETED → anything", () => {
    expect(canTransitionVisit("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(canTransitionVisit("COMPLETED", "CANCELLED")).toBe(false);
  });
  it("allows FAILED_NO_SHOW → SCHEDULED (re-arm)", () => {
    expect(canTransitionVisit("FAILED_NO_SHOW", "SCHEDULED")).toBe(true);
  });
});

describe("planVisitTransition", () => {
  it("stamps startedAt on IN_PROGRESS", () => {
    const update = planVisitTransition("SCHEDULED", "IN_PROGRESS", { now });
    expect(update.state).toBe("IN_PROGRESS");
    expect(update.startedAt).toEqual(now);
  });
  it("stamps completedAt on COMPLETED", () => {
    const update = planVisitTransition("IN_PROGRESS", "COMPLETED", { now });
    expect(update.state).toBe("COMPLETED");
    expect(update.completedAt).toEqual(now);
  });
  it("records failureReason on FAILED_NO_SHOW", () => {
    const update = planVisitTransition("SCHEDULED", "FAILED_NO_SHOW", {
      now,
      reason: "Customer not home",
    });
    expect(update.state).toBe("FAILED_NO_SHOW");
    expect(update.failureReason).toBe("Customer not home");
  });
  it("throws IllegalVisitTransitionError for forbidden moves", () => {
    expect(() => planVisitTransition("COMPLETED", "IN_PROGRESS")).toThrow(
      IllegalVisitTransitionError,
    );
  });
});
