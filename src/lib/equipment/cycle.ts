/** UTC 기준 YYYY-MM-DD 에 days 를 더한다. DST/타임존 영향 없음. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 최근교체일 + 주기(일) = 다음 예정일. */
export function nextDueDate(lastReplacedISO: string, cycleDays: number): string {
  return addDays(lastReplacedISO, cycleDays);
}

export type CycleUnit = "DAY" | "MONTH";

/** A cycle box value in its unit → stored days (1 month = 30 days). */
export function cycleDaysOf(value: number, unit: CycleUnit): number {
  return unit === "MONTH" ? value * 30 : value;
}

/**
 * anchor + one filter cycle. A DAY cycle adds days. A MONTH cycle is stored as
 * months × 30 and steps calendar months, so 2026-08-22 + 6 개월 is 2027-02-22;
 * a day the target month lacks lands on its last day (01-31 + 1 → 02-28).
 */
export function addCycle(anchor: Date, days: number, unit: CycleUnit | null | undefined): Date {
  const d = new Date(anchor);
  if (unit !== "MONTH") {
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(days / 30));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
