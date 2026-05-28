/**
 * Visit access + permission rules.
 *
 * Office side (ADMIN / MANAGER / STAFF): full visibility + write.
 * TECHNICIAN: only their own visits — either lead OR collaborator.
 *
 * Lead-only actions (per CLAUDE.md K.3):
 *   - start (mark IN_PROGRESS)
 *   - complete (mark COMPLETED, accept payment, sign work confirmation)
 *   - fail (FAILED_NO_SHOW)
 *
 * Both lead AND collaborators can:
 *   - read the detail
 *   - append notes + photos
 */

import type { StaffRole } from "@/lib/auth/roles";

export interface VisitActor {
  userId: string;
  role: StaffRole | string;
}

export interface MinimalVisit {
  leadTechnicianId: string | null;
  collaboratorTechnicianIds: string[];
}

export function isOfficeRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER" || role === "STAFF";
}

export function canCreateVisit(role: string): boolean {
  return isOfficeRole(role);
}

export function canEditVisitMeta(role: string): boolean {
  return isOfficeRole(role);
}

/**
 * MANAGER+ can reassign / reschedule once a visit is SCHEDULED. STAFF can
 * also reassign (small office), but we still gate the audit log.
 */
export function canReassign(role: string): boolean {
  return isOfficeRole(role);
}

/** True iff actor is the lead technician on this visit. */
export function isLead(actor: VisitActor, visit: MinimalVisit): boolean {
  return (
    actor.role === "TECHNICIAN" && visit.leadTechnicianId === actor.userId
  );
}

/** True iff actor is a collaborator (but not lead) on this visit. */
export function isCollaborator(
  actor: VisitActor,
  visit: MinimalVisit,
): boolean {
  return (
    actor.role === "TECHNICIAN" &&
    visit.leadTechnicianId !== actor.userId &&
    visit.collaboratorTechnicianIds.includes(actor.userId)
  );
}

/** Technician participates either as lead or collaborator. */
export function canTechnicianViewVisit(
  actor: VisitActor,
  visit: MinimalVisit,
): boolean {
  return isLead(actor, visit) || isCollaborator(actor, visit);
}

/** Office sees everything; technician only their own. */
export function canViewVisit(
  actor: VisitActor,
  visit: MinimalVisit,
): boolean {
  if (isOfficeRole(actor.role)) return true;
  return canTechnicianViewVisit(actor, visit);
}

/** Only the lead may start the visit (mobile flow). */
export function canStartVisit(
  actor: VisitActor,
  visit: MinimalVisit,
): boolean {
  return isLead(actor, visit);
}

/** Only the lead may complete the visit + collect payment + sign off. */
export function canCompleteVisit(
  actor: VisitActor,
  visit: MinimalVisit,
): boolean {
  return isLead(actor, visit);
}

export function canFailVisit(actor: VisitActor, visit: MinimalVisit): boolean {
  return isLead(actor, visit) || isOfficeRole(actor.role);
}

/** Lead + collaborators + office can append notes/photos. */
export function canAddVisitNotes(
  actor: VisitActor,
  visit: MinimalVisit,
): boolean {
  if (isOfficeRole(actor.role)) return true;
  return canTechnicianViewVisit(actor, visit);
}

/** Filter pushed into Prisma for technician list queries. */
export function technicianVisitWhere(actor: VisitActor) {
  return {
    OR: [
      { leadTechnicianId: actor.userId },
      { collaboratorTechnicianIds: { has: actor.userId } },
    ],
  } as const;
}
