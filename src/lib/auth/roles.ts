// Role hierarchy: lower index = higher authority
const ROLE_HIERARCHY = ['SYSTEM_ADMIN', 'DIRECTOR', 'MANAGER', 'STAFF'] as const;

export type RoleName = (typeof ROLE_HIERARCHY)[number];

export interface Actor {
  userId: string;
  role: string;
}

function getRoleLevel(role: string): number {
  const idx = ROLE_HIERARCHY.indexOf(role as RoleName);
  return idx === -1 ? Infinity : idx;
}

/** Returns role names that the given role can assign (strictly lower in hierarchy) */
export function getAssignableRoles(currentRole: string): string[] {
  const level = getRoleLevel(currentRole);
  return ROLE_HIERARCHY.filter((_, i) => i > level);
}

/** Check if currentRole can assign targetRole */
export function canAssignRole(currentRole: string, targetRole: string): boolean {
  return getRoleLevel(currentRole) < getRoleLevel(targetRole);
}

/** Roles that can see all projects regardless of membership */
export function canSeeAllProjects(role: string): boolean {
  return role === 'SYSTEM_ADMIN' || role === 'DIRECTOR';
}

/** Check if callerRole can reset targetRole's password */
export function canResetPassword(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'SYSTEM_ADMIN') return true;
  if (callerRole === 'DIRECTOR' && targetRole !== 'SYSTEM_ADMIN') return true;
  return false;
}

/**
 * Whether the role is one of the two HQ roles (admin or director). These roles
 * bypass project-membership checks and are the only ones allowed to lock a plan
 * or approve/reject a plan change request.
 */
export function isHqRole(role: string): boolean {
  return role === 'SYSTEM_ADMIN' || role === 'DIRECTOR';
}

/**
 * Can the actor reassign the project's site manager slot?
 *
 * HQ-only: a site manager cannot replace themselves. Pure-sync (no DB lookup)
 * so client pages and server routes share the same predicate without dragging
 * Prisma into the client bundle.
 */
export function canReassignSiteManager(actor: Actor): boolean {
  return canSeeAllProjects(actor.role);
}
