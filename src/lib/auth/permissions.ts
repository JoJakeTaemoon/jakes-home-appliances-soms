/**
 * Permission verbs for Jake's Home Appliances SOMS.
 *
 * These wrap the pure-sync role primitives in `@/lib/auth/roles` with
 * domain language used by the screens (UC catalogue codes). Adding a new
 * verb here is cheaper than scattering `role === "ADMIN"` checks across
 * route handlers, and gives one place to look when the permission matrix
 * changes.
 *
 * Pure-sync only — no DB lookups. Anything that needs DB context lives
 * with the feature that owns the resource (e.g. customer ownership).
 */

import {
  canApproveOps,
  canManageStaff,
  canResetCustomerPassword,
  isOfficeRole,
  isTechnicianRole,
  type Actor,
} from "@/lib/auth/roles";

/** Office staff (ADMIN/MANAGER/STAFF) — bypasses field-only routes. */
export function canAccessOfficeUI(actor: Actor): boolean {
  return isOfficeRole(actor.role);
}

/** Technicians — bypasses office-only routes. */
export function canAccessTechnicianUI(actor: Actor): boolean {
  return isTechnicianRole(actor.role);
}

/** Can the actor create / edit / archive other staff users? */
export function canAdministerUsers(actor: Actor): boolean {
  return canManageStaff(actor.role);
}

/** Can the actor approve a service request, change prices, issue tax invoices? */
export function canApprove(actor: Actor): boolean {
  return canApproveOps(actor.role);
}

/** Can the actor reset a customer-portal password? */
export function canResetPortalPassword(actor: Actor): boolean {
  return canResetCustomerPassword(actor.role);
}
