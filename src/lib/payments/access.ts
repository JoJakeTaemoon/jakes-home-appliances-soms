/**
 * Payment role gates.
 *
 *   - View list / detail               : office (STAFF+) OR collecting technician
 *   - Create EXPECTED Payment          : office (STAFF+)
 *   - Record cash collection (visit)   : lead technician on the visit
 *   - Record bank transfer reconcile   : office (STAFF+)
 *   - Hand over cash                   : the collecting technician OR office STAFF+
 *   - Reconcile                        : MANAGER+
 *   - Write off                        : MANAGER+
 *   - Apply partial payment            : office (STAFF+)
 *   - Issue tax invoice                : MANAGER+
 */

import type { StaffRole } from "@/lib/auth/roles";

export function isOfficeRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

export function isManagerOrHigher(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function canCreateExpectedPayment(role: string): boolean {
  return isOfficeRole(role);
}

export function canRecordBankTransfer(role: string): boolean {
  return isOfficeRole(role);
}

export function canHandOver(
  role: string,
  ctx: { paymentCollectedById: string | null; actorUserId: string },
): boolean {
  if (isOfficeRole(role)) return true;
  if (role === "TECHNICIAN") {
    return ctx.paymentCollectedById === ctx.actorUserId;
  }
  return false;
}

export function canReconcile(role: string): boolean {
  return isManagerOrHigher(role);
}

export function canWriteOff(role: string): boolean {
  return isManagerOrHigher(role);
}

export function canApplyPartial(role: string): boolean {
  return isOfficeRole(role);
}

export function canIssueTaxInvoice(role: string): boolean {
  return isManagerOrHigher(role);
}

export function canViewPaymentList(role: string): boolean {
  return isOfficeRole(role) || role === "TECHNICIAN";
}

/**
 * For a technician, restrict list scope to their own collected payments.
 * Office roles see everything.
 */
export function paymentScopeForActor(
  role: StaffRole | string,
  actorUserId: string,
): { all: true } | { collectedById: string } {
  if (isOfficeRole(role)) return { all: true };
  return { collectedById: actorUserId };
}
