/**
 * GET  /api/users — list staff users (open to all staff for dropdowns).
 * POST /api/users — create new staff user. ADMIN + MANAGER only.
 */

import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { ConflictError, ForbiddenError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/auth/recovery";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  handler: async ({ request }) => {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const includeDisabled = url.searchParams.get("includeDisabled") === "true";
    const where: Prisma.UserWhereInput = {};
    if (!includeDisabled) where.status = "ACTIVE";
    if (role && ["ADMIN", "MANAGER", "STAFF", "TECHNICIAN"].includes(role)) {
      where.role = role as Prisma.UserWhereInput["role"];
    }
    return prisma.user.findMany({
      where,
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        preferredRegion: true,
        phone: true,
        status: true,
      },
    });
  },
});

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(4).max(40),
  password: z.string().min(8).max(120),
  role: z.enum(["ADMIN", "MANAGER", "STAFF", "TECHNICIAN"]),
  preferredRegion: z.string().trim().max(60).optional(),
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
      throw new ForbiddenError("Only ADMIN or MANAGER can create users");
    }
  },
  body: createUserSchema,
  successStatus: 201,
  handler: async ({ auth, body, request }) => {
    const phone = normalizePhone(body.phone);
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, username: true },
    });
    if (existing) throw new ConflictError("Phone already in use");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await prisma.user.create({
      data: {
        username: body.username,
        phone,
        passwordHash,
        role: body.role,
        preferredRegion: body.preferredRegion ?? null,
        mustChangePassword: true,
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
      actorId: auth.userId,
      action: "USER_CREATE",
      entityType: "User",
      entityId: created.id,
      after: { username: created.username, phone, role: created.role },
      request,
    });

    return created;
  },
});
