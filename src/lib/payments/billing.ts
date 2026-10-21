/**
 * The monthly bill: when it falls due and how much it is for.
 *
 * Pure — no Prisma — so the recurring-payment job, the data migration and the
 * "this contract never bills" warning on the office screen all apply the same
 * rule.
 */

/** The old fixed due day, kept for contracts with no billing day set. */
export const DEFAULT_BILLING_DAY = 10;

/**
 * The due instant for the month containing `month`: the contract's billing
 * day (출금일) at 23:59:59 UTC, pulled back to the last day of a short month.
 */
export function dueDateForMonth(month: Date, billingDay: number | null | undefined): Date {
  const y = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(billingDay ?? DEFAULT_BILLING_DAY, last);
  return new Date(Date.UTC(y, m, day, 23, 59, 59));
}

type Money = { toString(): string } | null | undefined;

export interface BillableContract {
  type: string;
  monthlyMaintenanceFee: Money;
  equipment: ReadonlyArray<{ unitPrice: Money; quantity: number | null }>;
}

/**
 * What one month bills: the contract's monthly fee, or for a rental with no
 * fee of its own the sum of its unit prices. Zero means the recurring job
 * skips the contract every month.
 */
export function monthlyBillingAmount(c: BillableContract): number {
  if (c.monthlyMaintenanceFee) return Number(c.monthlyMaintenanceFee.toString());
  if (c.type !== "RENTAL") return 0;
  return c.equipment.reduce(
    (acc, ce) => acc + (ce.unitPrice ? Number(ce.unitPrice.toString()) : 0) * (ce.quantity ?? 1),
    0,
  );
}
