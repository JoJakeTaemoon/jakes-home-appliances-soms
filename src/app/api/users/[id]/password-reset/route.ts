/**
 * POST /api/users/[id]/password-reset
 *
 * Admin-issued password reset for a staff user. There is no self-service
 * recovery: a user who is locked out phones the office, and ADMIN/MANAGER
 * resets them here. The new temp password is returned in the response and
 * shown on-screen ONCE — it is never sent by SMS, so it cannot be read off a
 * delivery log or an intercepted handset.
 *
 * Side effects: `mustChangePassword=true` (forces a change at next login),
 * lockout counters cleared, and every active session revoked.
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation } from "@/lib/api/mutation";
import { generateRandomPassword, hashPassword } from "@/lib/auth/password";
import { ForbiddenError, NotFoundError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { canResetPassword } from "@/lib/auth/roles";

const paramsSchema = z.object({ id: z.string().min(1) });

const TEMP_PASSWORD_LENGTH = 10;

export const POST = defineMutation({
  audience: "staff",
  params: paramsSchema,
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
      throw new ForbiddenError("Only ADMIN or MANAGER can reset passwords");
    }
  },
  handler: async ({ auth, params, request }) => {
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, role: true, status: true },
    });
    if (!target) throw new NotFoundError("User not found");

    // Resetting a peer hands you their account, so the ladder is strictly
    // downward — a MANAGER cannot reach an ADMIN or another MANAGER.
    if (!canResetPassword(auth.role, target.role)) {
      throw new ForbiddenError(
        "You can only reset the password of users below your own role",
      );
    }

    const tempPassword = generateRandomPassword(TEMP_PASSWORD_LENGTH);
    const passwordHash = await hashPassword(tempPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "PASSWORD_RESET_BY_STAFF",
      entityType: "User",
      entityId: target.id,
      after: { username: target.username, role: target.role },
      request,
    });

    return {
      id: target.id,
      username: target.username,
      tempPassword,
    };
  },
});
