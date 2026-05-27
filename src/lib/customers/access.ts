/**
 * Customer access policy.
 *
 * Phase 2: all office roles (ADMIN / MANAGER / STAFF) can view and edit any
 * customer. TECHNICIAN is gated separately and currently denied (Phase 4
 * will widen this to "customers assigned to my visits").
 *
 * Mutation gates layered on top of read access:
 *   - createCustomer       : ADMIN, MANAGER, STAFF
 *   - updateCustomer       : ADMIN, MANAGER, STAFF
 *   - deactivateCustomer   : ADMIN, MANAGER       (MANAGER+)
 *   - reactivateCustomer   : ADMIN                (ADMIN-only)
 *   - manageContact        : ADMIN, MANAGER, STAFF (any office role)
 *   - editContractParty    : ADMIN, MANAGER       (sensitive — affects contracts)
 *   - manageSite           : ADMIN, MANAGER, STAFF
 *   - deactivateSite       : ADMIN, MANAGER
 */

import type { StaffRole } from "@/lib/auth/roles";

export function canViewCustomer(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

export function canCreateCustomer(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

export function canUpdateCustomer(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

export function canDeactivateCustomer(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function canReactivateCustomer(role: StaffRole | string): boolean {
  return role === "ADMIN";
}

export function canManageContact(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

/** Editing the Contract Party requires MANAGER+ because it affects contracts. */
export function canEditContractParty(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageSite(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

export function canDeactivateSite(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageEquipment(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

/** Equipment models are catalog data — MANAGER+ only. */
export function canManageEquipmentModel(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
