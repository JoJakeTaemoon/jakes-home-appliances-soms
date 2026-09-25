/**
 * Seoul Aqua SOMS — Role hierarchy.
 *
 * Three-tier office hierarchy (ADMIN > MANAGER > STAFF) plus a parallel
 * field role (TECHNICIAN) that does not participate in office authority
 * comparisons. Customer authentication is separate (CustomerContact +
 * CustomerSession) — customers are NOT in this enum.
 *
 * Lower index = higher authority among office roles.
 */

export const STAFF_ROLES = ["ADMIN", "MANAGER", "STAFF", "TECHNICIAN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Office hierarchy: lower index = more authority. TECHNICIAN is intentionally
// omitted — they're peer to no one in the office stack.
const OFFICE_HIERARCHY = ["ADMIN", "MANAGER", "STAFF"] as const;
type OfficeRole = (typeof OFFICE_HIERARCHY)[number];

export interface Actor {
  userId: string;
  role: StaffRole | string;
}

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** True iff role is one of the office (HQ) roles — i.e. NOT a technician. */
export function isOfficeRole(role: string): boolean {
  return (OFFICE_HIERARCHY as readonly string[]).includes(role);
}

/** True iff role is a field technician. */
export function isTechnicianRole(role: string): boolean {
  return role === "TECHNICIAN";
}

/**
 * Numeric level for office roles. TECHNICIAN returns Infinity so it never
 * outranks anyone in the office stack and never inherits office assignment
 * privileges by accident.
 */
export function getRoleLevel(role: string): number {
  const idx = OFFICE_HIERARCHY.indexOf(role as OfficeRole);
  return idx === -1 ? Infinity : idx;
}

/**
 * Returns the StaffRoles that the given role is allowed to assign to others.
 * Strictly lower in the office hierarchy. TECHNICIAN can assign nothing.
 *
 * ADMIN  -> MANAGER, STAFF, TECHNICIAN
 * MANAGER-> STAFF, TECHNICIAN
 * STAFF  -> (none)
 * TECHNICIAN -> (none)
 */
export function getAssignableRoles(currentRole: string): StaffRole[] {
  if (currentRole === "ADMIN") return ["MANAGER", "STAFF", "TECHNICIAN"];
  if (currentRole === "MANAGER") return ["STAFF", "TECHNICIAN"];
  return [];
}

/** Check if currentRole can assign targetRole. */
export function canAssignRole(currentRole: string, targetRole: string): boolean {
  return (getAssignableRoles(currentRole) as readonly string[]).includes(targetRole);
}

/**
 * Can `callerRole` administer a user holding `targetRole`?
 *
 * Strictly downward: you manage the ranks below you and never your own.
 *
 *   ADMIN   -> MANAGER / STAFF / TECHNICIAN   (never another ADMIN)
 *   MANAGER -> STAFF / TECHNICIAN             (never a MANAGER or ADMIN)
 *   STAFF / TECHNICIAN -> nobody
 *
 * One rule for every user-management verb — edit, re-role, phone change,
 * password reset, deactivate — so the screen and the five routes behind it
 * cannot drift apart. A peer-on-peer action is the one that matters: two
 * MANAGERs could otherwise reset each other and an ADMIN could be taken over
 * by whoever reaches the account first.
 */
export function outranks(callerRole: string, targetRole: string): boolean {
  if (callerRole === "ADMIN") return targetRole !== "ADMIN";
  if (callerRole === "MANAGER") {
    return targetRole === "STAFF" || targetRole === "TECHNICIAN";
  }
  return false;
}

/** Staff-account password reset — same ladder as every other verb. */
export function canResetPassword(callerRole: string, targetRole: string): boolean {
  return outranks(callerRole, targetRole);
}

/**
 * Can the actor reset a customer-portal (CustomerContact) password?
 * Per UC-AU-06: MANAGER+ allowed.
 */
export function canResetCustomerPassword(callerRole: string): boolean {
  return callerRole === "ADMIN" || callerRole === "MANAGER";
}

/** Can the actor administrate the application (system settings / users)? */
export function isAdminRole(role: string): boolean {
  return role === "ADMIN";
}

/**
 * Can the actor manage other staff users (create / disable / re-role)?
 * ADMIN only, per SPEC §2.1 permission matrix.
 */
export function canManageStaff(callerRole: string): boolean {
  return callerRole === "ADMIN";
}

/**
 * Can the actor approve/reject service requests, issue tax invoices, or
 * change prices? MANAGER+ per SPEC.
 */
export function canApproveOps(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
