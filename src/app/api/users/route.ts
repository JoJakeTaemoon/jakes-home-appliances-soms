/**
 * GET /api/users — minimal list for selectors (e.g. preferred technician).
 *
 * Limited to id/username/role/preferredRegion fields. Read-only — used by
 * dropdowns in Customer + Equipment forms. Phase 2 scope.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import type { Prisma } from "@/generated/prisma/client";

export const GET = defineQuery({
  audience: "staff",
  handler: async ({ request }) => {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const where: Prisma.UserWhereInput = { status: "ACTIVE" };
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
      },
    });
  },
});
