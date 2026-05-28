/**
 * Contract access policy (SPEC §2.1 permissions matrix).
 *
 * Office roles (ADMIN / MANAGER / STAFF) view + create draft contracts.
 * MANAGER+ for sensitive ops: state changes beyond PENDING_SIGNATURE, amend,
 * renew, regenerate PDF, terminate.
 *
 * STAFF can:
 *   - view contracts
 *   - create DRAFT
 *   - move DRAFT → PENDING_SIGNATURE
 *   - download PDF / email PDF (UC-CT-10)
 *
 * MANAGER+ adds:
 *   - PENDING_SIGNATURE → ACTIVE | CANCELLED
 *   - ACTIVE → TERMINATED
 *   - ACTIVE → COMPLETED (in the rare manual-close case; usually cron does it)
 *   - Amend (UC-CT-05 / UC-CT-09)
 *   - Renew (UC-CT-06)
 *   - Regenerate PDF (UC-CT-10 — re-issue after Contract Party edit)
 */

import type { StaffRole } from "@/lib/auth/roles";
import type { ContractState } from "@/lib/contracts/state";

function isOffice(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

function isManagerPlus(role: StaffRole | string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

export function canViewContract(role: StaffRole | string): boolean {
  return isOffice(role);
}

export function canCreateContract(role: StaffRole | string): boolean {
  return isOffice(role);
}

/** Editing a DRAFT (basic fields). Office roles. */
export function canEditDraftContract(role: StaffRole | string): boolean {
  return isOffice(role);
}

/** Editing notes on an ACTIVE contract. Office roles. */
export function canEditActiveContractNotes(role: StaffRole | string): boolean {
  return isOffice(role);
}

export function canAmendContract(role: StaffRole | string): boolean {
  return isManagerPlus(role);
}

export function canRenewContract(role: StaffRole | string): boolean {
  return isManagerPlus(role);
}

export function canRegenerateContractPdf(role: StaffRole | string): boolean {
  return isManagerPlus(role);
}

export function canEmailContract(role: StaffRole | string): boolean {
  return isOffice(role);
}

/**
 * Authority to drive a specific state transition. Returns true iff `role`
 * is allowed to push the contract from `from` to `to` (assuming the
 * transition itself is legal — that's a separate concern).
 */
export function canTransitionContract(
  role: StaffRole | string,
  from: ContractState,
  to: ContractState,
): boolean {
  // STAFF can only push DRAFT → PENDING_SIGNATURE.
  if (role === "STAFF") {
    return from === "DRAFT" && to === "PENDING_SIGNATURE";
  }
  // MANAGER + ADMIN: everything that the state machine permits.
  return isManagerPlus(role);
}
