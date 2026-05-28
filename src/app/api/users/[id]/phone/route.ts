/**
 * PATCH /api/users/[id]/phone
 *
 * Updates another staff user's login phone. Restricted to ADMIN + MANAGER —
 * STAFF and TECHNICIAN cannot touch user records. The caller may also
 * update their own phone via this endpoint (covers the self-service case).
 *
 * Side effects on change:
 *   • previous phone is invalidated as a login key
 *   • active sessions for the affected user are revoked so a phone swap
 *     forces a fresh login (defence-in-depth against accidental hijack)
 *   • AuditLog row written with before / after for forensics
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import {
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/auth/recovery";

const paramsSchema = z.object({ id: z.string().min(1) });

const bodySchema = z.object({
  phone: z
    .string()
    .trim()
    .min(4, "Phone is too short")
    .max(40, "Phone is too long"),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireAuth(request);
    if (caller.role !== "ADMIN" && caller.role !== "MANAGER") {
      throw new ForbiddenError(
        "Only ADMIN or MANAGER can change another user's phone",
      );
    }

    const params = paramsSchema.parse(await ctx.params);
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const nextPhone = normalizePhone(parsed.data.phone);
    if (nextPhone.length < 4) {
      throw new ValidationError("Phone must contain at least 4 digits", []);
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, phone: true, role: true },
    });
    if (!target) throw new NotFoundError("User not found");

    if (target.phone === nextPhone) {
      // No-op — return current row so the UI can refresh without surprise.
      return successResponse({
        id: target.id,
        username: target.username,
        phone: target.phone,
      });
    }

    const collision = await prisma.user.findUnique({
      where: { phone: nextPhone },
      select: { id: true },
    });
    if (collision && collision.id !== target.id) {
      throw new ConflictError("Phone already in use by another user");
    }

    const before = { phone: target.phone };

    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { phone: nextPhone },
      }),
      // Revoke active sessions — the affected user must re-authenticate
      // with the new phone. Belt-and-suspenders against accidental
      // session hijack via stale cookies.
      prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "USER_PHONE_UPDATE",
      entityType: "User",
      entityId: target.id,
      before,
      after: { phone: nextPhone },
      request,
    });

    return successResponse({
      id: target.id,
      username: target.username,
      phone: nextPhone,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
