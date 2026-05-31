/**
 * PATCH  /api/users/[id]  — update username / role / preferred region.
 * DELETE /api/users/[id]  — soft-disable (status=DISABLED) + revoke sessions.
 *
 * ADMIN + MANAGER only. A user cannot disable themselves (defensive — would
 * lock the only ADMIN out). Phone changes still go through the dedicated
 * /phone endpoint so the rotation + audit semantics stay isolated.
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
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

const paramsSchema = z.object({ id: z.string().min(1) });

const patchBodySchema = z.object({
  username: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "MANAGER", "STAFF", "TECHNICIAN"]).optional(),
  preferredRegion: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.union([z.string().trim().max(60), z.null()])
    )
    .optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

function requireAdminOrManager(role: string) {
  if (role !== "ADMIN" && role !== "MANAGER") {
    throw new ForbiddenError("Only ADMIN or MANAGER can manage users");
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireAuth(request);
    requireAdminOrManager(caller.role);

    const params = paramsSchema.parse(await ctx.params);
    const json = await request.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const before = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, role: true, preferredRegion: true },
    });
    if (!before) throw new NotFoundError("User not found");

    // MANAGER may not promote anyone to ADMIN nor edit existing ADMINs.
    if (caller.role === "MANAGER") {
      if (before.role === "ADMIN") {
        throw new ForbiddenError("MANAGER cannot edit an ADMIN user");
      }
      if (parsed.data.role === "ADMIN") {
        throw new ForbiddenError("MANAGER cannot promote to ADMIN");
      }
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: {
        username: parsed.data.username,
        role: parsed.data.role,
        preferredRegion:
          parsed.data.preferredRegion === undefined
            ? undefined
            : parsed.data.preferredRegion,
      },
      select: {
        id: true,
        username: true,
        phone: true,
        role: true,
        preferredRegion: true,
        status: true,
      },
    });

    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: params.id,
      before,
      after: {
        username: updated.username,
        role: updated.role,
        preferredRegion: updated.preferredRegion,
      },
      request,
    });

    return successResponse(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const caller = await requireAuth(request);
    requireAdminOrManager(caller.role);

    const params = paramsSchema.parse(await ctx.params);

    if (params.id === caller.userId) {
      throw new ValidationError("You cannot disable your own account");
    }

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, role: true, status: true },
    });
    if (!target) throw new NotFoundError("User not found");

    if (caller.role === "MANAGER" && target.role === "ADMIN") {
      throw new ForbiddenError("MANAGER cannot disable an ADMIN user");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: { status: "DISABLED" },
      }),
      prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await logAudit({
      actorType: "USER",
      actorId: caller.userId,
      action: "USER_DISABLE",
      entityType: "User",
      entityId: target.id,
      before: { status: target.status },
      after: { status: "DISABLED" },
      request,
    });

    return successResponse({ disabled: true, id: target.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
