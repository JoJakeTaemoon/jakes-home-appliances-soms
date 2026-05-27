import { describe, it, expect } from "vitest";
import {
  canTransitionPayment,
  planPaymentTransition,
  isTerminalPaymentState,
  isOverduePaymentState,
  computeOverdueTier,
  IllegalPaymentTransitionError,
} from "@/lib/payments/state";

const now = new Date("2026-06-15T12:00:00.000Z");

describe("canTransitionPayment", () => {
  it("allows EXPECTED → COLLECTED", () => {
    expect(canTransitionPayment("EXPECTED", "COLLECTED")).toBe(true);
  });

  it("allows EXPECTED → RECONCILED (direct, e.g. bank transfer)", () => {
    expect(canTransitionPayment("EXPECTED", "RECONCILED")).toBe(true);
  });

  it("allows COLLECTED → HANDED_OVER → RECONCILED", () => {
    expect(canTransitionPayment("COLLECTED", "HANDED_OVER")).toBe(true);
    expect(canTransitionPayment("HANDED_OVER", "RECONCILED")).toBe(true);
  });

  it("allows COLLECTED → RECONCILED (small office skips handover)", () => {
    expect(canTransitionPayment("COLLECTED", "RECONCILED")).toBe(true);
  });

  it("allows OVERDUE_D7 → COLLECTED (late payment)", () => {
    expect(canTransitionPayment("OVERDUE_D7", "COLLECTED")).toBe(true);
  });

  it("allows OVERDUE_D7 → OVERDUE_D14 → OVERDUE_D30 → WRITTEN_OFF", () => {
    expect(canTransitionPayment("OVERDUE_D7", "OVERDUE_D14")).toBe(true);
    expect(canTransitionPayment("OVERDUE_D14", "OVERDUE_D30")).toBe(true);
    expect(canTransitionPayment("OVERDUE_D30", "WRITTEN_OFF")).toBe(true);
  });

  it("disallows transitions out of RECONCILED", () => {
    expect(canTransitionPayment("RECONCILED", "EXPECTED")).toBe(false);
    expect(canTransitionPayment("RECONCILED", "COLLECTED")).toBe(false);
  });

  it("disallows transitions out of WRITTEN_OFF", () => {
    expect(canTransitionPayment("WRITTEN_OFF", "EXPECTED")).toBe(false);
  });

  it("disallows skipping backwards (RECONCILED → HANDED_OVER)", () => {
    expect(canTransitionPayment("RECONCILED", "HANDED_OVER")).toBe(false);
  });
});

describe("planPaymentTransition", () => {
  it("stamps collectedAt on COLLECTED", () => {
    const u = planPaymentTransition("EXPECTED", "COLLECTED", { now });
    expect(u.state).toBe("COLLECTED");
    expect(u.collectedAt).toEqual(now);
  });

  it("stamps handedOverAt on HANDED_OVER", () => {
    const u = planPaymentTransition("COLLECTED", "HANDED_OVER", { now });
    expect(u.handedOverAt).toEqual(now);
  });

  it("stamps reconciledAt on RECONCILED", () => {
    const u = planPaymentTransition("HANDED_OVER", "RECONCILED", { now });
    expect(u.reconciledAt).toEqual(now);
  });

  it("does not stamp timestamps for overdue transitions", () => {
    const u = planPaymentTransition("EXPECTED", "OVERDUE_D7", { now });
    expect(u.state).toBe("OVERDUE_D7");
    expect(u.collectedAt).toBeUndefined();
    expect(u.handedOverAt).toBeUndefined();
    expect(u.reconciledAt).toBeUndefined();
  });

  it("throws on illegal transition", () => {
    expect(() => planPaymentTransition("RECONCILED", "COLLECTED")).toThrow(
      IllegalPaymentTransitionError,
    );
  });
});

describe("helpers", () => {
  it("recognises terminal states", () => {
    expect(isTerminalPaymentState("RECONCILED")).toBe(true);
    expect(isTerminalPaymentState("WRITTEN_OFF")).toBe(true);
    expect(isTerminalPaymentState("COLLECTED")).toBe(false);
  });

  it("recognises overdue states", () => {
    expect(isOverduePaymentState("OVERDUE_D7")).toBe(true);
    expect(isOverduePaymentState("OVERDUE_D14")).toBe(true);
    expect(isOverduePaymentState("OVERDUE_D30")).toBe(true);
    expect(isOverduePaymentState("EXPECTED")).toBe(false);
  });

  it("computes overdue tier from days past due", () => {
    expect(computeOverdueTier(0)).toBeNull();
    expect(computeOverdueTier(6)).toBeNull();
    expect(computeOverdueTier(7)).toBe("OVERDUE_D7");
    expect(computeOverdueTier(13)).toBe("OVERDUE_D7");
    expect(computeOverdueTier(14)).toBe("OVERDUE_D14");
    expect(computeOverdueTier(29)).toBe("OVERDUE_D14");
    expect(computeOverdueTier(30)).toBe("OVERDUE_D30");
    expect(computeOverdueTier(60)).toBe("OVERDUE_D30");
  });
});
