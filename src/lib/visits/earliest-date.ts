/**
 * Earliest practical visit date for the order-create modal default.
 *
 * Tomorrow, advancing through Sundays. Vietnam ops generally don't roll
 * trucks on Sunday; this matches the office's verbal rule. Office staff
 * always remain free to pick any date — this is just the pre-fill so
 * they aren't typing a date for every order.
 *
 * Returned as a midnight-local Date so the value round-trips cleanly
 * through `<input type="date">` (which only carries the calendar day).
 */
export function earliestVisitDate(from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Same as `earliestVisitDate` but emits `YYYY-MM-DD` for direct use as
 * the `value` of an `<input type="date">`.
 */
export function earliestVisitDateString(from: Date = new Date()): string {
  const d = earliestVisitDate(from);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
