import { describe, expect, it } from "vitest";
import {
  addDays,
  closePause,
  daysBetween,
  effectiveEndDate,
  openPause,
  pausedDaysAsOf,
} from "@/lib/contracts/pause-period";

describe("pause-period: pausedDaysAsOf", () => {
  it("returns cumulative when no window is open", () => {
    expect(
      pausedDaysAsOf(
        { cumulativePausedDays: 14, currentPauseStartedAt: null },
        new Date("2026-06-22"),
      ),
    ).toBe(14);
  });

  it("adds in-flight days when a window is currently open", () => {
    expect(
      pausedDaysAsOf(
        {
          cumulativePausedDays: 14,
          currentPauseStartedAt: new Date("2026-06-12"),
        },
        new Date("2026-06-22"),
      ),
    ).toBe(14 + 10);
  });

  it("clamps negative in-flight days at zero (clock-skew safety)", () => {
    expect(
      pausedDaysAsOf(
        {
          cumulativePausedDays: 14,
          currentPauseStartedAt: new Date("2026-06-30"),
        },
        new Date("2026-06-22"),
      ),
    ).toBe(14);
  });
});

describe("pause-period: effectiveEndDate", () => {
  it("returns null when the contract has no endDate", () => {
    expect(
      effectiveEndDate(
        null,
        { cumulativePausedDays: 14, currentPauseStartedAt: null },
        new Date("2026-06-22"),
      ),
    ).toBeNull();
  });

  it("adds cumulative paused days to the contract endDate", () => {
    expect(
      effectiveEndDate(
        new Date("2028-06-15"),
        { cumulativePausedDays: 14, currentPauseStartedAt: null },
        new Date("2026-06-22"),
      ),
    ).toEqual(new Date("2028-06-29"));
  });

  it("adds in-flight pause days too", () => {
    // 14 cumulative + 10 in-flight = 24 days added to 2028-06-15 → 2028-07-09
    expect(
      effectiveEndDate(
        new Date("2028-06-15"),
        {
          cumulativePausedDays: 14,
          currentPauseStartedAt: new Date("2026-06-12"),
        },
        new Date("2026-06-22"),
      ),
    ).toEqual(new Date("2028-07-09"));
  });
});

describe("pause-period: open/close idempotency", () => {
  it("openPause on an already-open window is a no-op", () => {
    const start = new Date("2026-06-12");
    const ledger = { cumulativePausedDays: 14, currentPauseStartedAt: start };
    expect(openPause(ledger, new Date("2026-06-22"))).toEqual(ledger);
  });

  it("closePause on a never-opened window is a no-op", () => {
    const ledger = { cumulativePausedDays: 14, currentPauseStartedAt: null };
    expect(closePause(ledger, new Date("2026-06-22"))).toEqual(ledger);
  });

  it("close rolls elapsed days into cumulative + clears the window", () => {
    const result = closePause(
      {
        cumulativePausedDays: 14,
        currentPauseStartedAt: new Date("2026-06-12"),
      },
      new Date("2026-06-22"),
    );
    expect(result).toEqual({
      cumulativePausedDays: 24,
      currentPauseStartedAt: null,
    });
  });
});

describe("pause-period: arithmetic helpers", () => {
  it("addDays handles month boundaries", () => {
    expect(addDays(new Date("2026-01-31"), 1)).toEqual(new Date("2026-02-01"));
  });

  it("daysBetween is exclusive-of-fractional", () => {
    expect(
      daysBetween(new Date("2026-06-12T10:00:00Z"), new Date("2026-06-22T05:00:00Z")),
    ).toBe(9); // 9 full days, the 10th is not yet complete
  });
});
