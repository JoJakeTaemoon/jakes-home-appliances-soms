/**
 * GET /api/users — minimal list for selectors (e.g. preferred technician).
 *
 * Limited to id/username/role/preferredRegion fields. Read-only — used by
 * dropdowns in Customer + Equipment forms. Phase 2 scope.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const where: Prisma.UserWhereInput = { status: "ACTIVE" };
    if (role && ["ADMIN", "MANAGER", "STAFF", "TECHNICIAN"].includes(role)) {
      where.role = role as Prisma.UserWhereInput["role"];
    }
    const users = await prisma.user.findMany({
      where,
      orderBy: { username: "asc" },
      select: { id: true, username: true, role: true, preferredRegion: true, phone: true },
    });
    return successResponse(users);
  } catch (err) {
    return toErrorResponse(err);
  }
}
