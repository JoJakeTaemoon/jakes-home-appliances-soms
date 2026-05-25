import prisma from '@/lib/prisma';
import { canSeeAllProjects, type Actor } from '@/lib/auth/roles';

/**
 * Permission verbs that need a DB lookup. Each composes the underlying
 * primitives (canSeeAllProjects, site-manager membership) into a question that
 * matches the domain:
 *
 *   "Can this actor do thing X on resource Y?"
 *
 * Pure-sync verbs live in `@/lib/auth/roles` so client bundles don't drag
 * Prisma in via this file.
 *
 * For daily-report-specific verbs (canReview, canReadReports, isActiveReporter)
 * see `src/lib/daily-report/permissions.ts`. This module is for project-level
 * membership / role administration.
 */

async function callerIsSiteManager(actor: Actor, projectId: string): Promise<boolean> {
  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: actor.userId, projectId } },
    include: { role: { select: { name: true } } },
  });
  return membership?.role.name === 'MANAGER';
}

/**
 * Can the actor manage this project's member list (add/remove members)?
 *  - SYSTEM_ADMIN / DIRECTOR always
 *  - The project's site manager (ProjectMember with role.name === 'MANAGER')
 */
export async function canManageProjectMembers(
  actor: Actor,
  projectId: string,
): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return callerIsSiteManager(actor, projectId);
}

/**
 * Can the actor assign / change this project's active Major Reporter?
 *  - Same rule as canManageProjectMembers today, exposed as a distinct verb
 *    because the routes are separate and the audience may grow apart later.
 */
export async function canAssignMajorReporter(
  actor: Actor,
  projectId: string,
): Promise<boolean> {
  if (canSeeAllProjects(actor.role)) return true;
  return callerIsSiteManager(actor, projectId);
}
