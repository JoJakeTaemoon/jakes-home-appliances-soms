/**
 * GET  /api/customers — paginated list with search + filters.
 * POST /api/customers — create B2C or B2B customer with primary contacts.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { requireAuth } from "@/lib/auth/guards";
import { canCreateCustomer, canViewCustomer } from "@/lib/customers/access";
import {
  createCustomerSchema,
  customerListQuerySchema,
} from "@/lib/validators/customer";
import {
  errorResponse,
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/api/error";
import { allocateCustomerCode } from "@/lib/customers/code";
import { logAudit } from "@/lib/audit";
import { resolveOrderBy, type SortMap } from "@/lib/api/sort";
import type { Prisma } from "@/generated/prisma/client";

const CUSTOMER_SORT_MAP: SortMap<Prisma.CustomerOrderByWithRelationInput> = {
  code: (dir) => ({ code: dir }),
  name: (dir) => ({ name: dir }),
  type: (dir) => ({ type: dir }),
  status: (dir) => ({ status: dir }),
  shortcode: (dir) => ({ shortcode: dir }),
  preferredRegion: (dir) => ({ preferredRegion: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
};

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewCustomer(auth.role)) {
      throw new ForbiddenError("Cannot view customers");
    }
  },
  query: customerListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, type, status, region, sortBy, sortDir, page, pageSize } = query;
    const orderBy = resolveOrderBy({ sortBy, sortDir }, CUSTOMER_SORT_MAP, { code: "asc" });

    const where: Prisma.CustomerWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (region) where.preferredRegion = region;
    if (q) {
      const term = q.trim();
      where.OR = [
        { code: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { shortcode: { contains: term, mode: "insensitive" } },
        { taxCode: { contains: term, mode: "insensitive" } },
        { nationalId: { contains: term, mode: "insensitive" } },
        { passportNumber: { contains: term, mode: "insensitive" } },
        { address: { contains: term, mode: "insensitive" } },
        { contacts: { some: { phone1: { contains: term } } } },
        { contacts: { some: { name: { contains: term, mode: "insensitive" } } } },
        { sites: { some: { address: { contains: term, mode: "insensitive" } } } },
      ];
    }

    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
          _count: {
            select: { equipment: true, sites: true, contracts: true },
          },
        },
      }),
    ]);

    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canCreateCustomer(auth.role)) {
      throw new ForbiddenError("Cannot create customers");
    }

    const body = await request.json().catch(() => null);
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid customer payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    // B2B uniqueness checks before transaction.
    if (data.type === "B2B") {
      const existing = await prisma.customer.findFirst({
        where: { shortcode: data.shortcode },
        select: { id: true, code: true },
      });
      if (existing) {
        throw new ConflictError(`Shortcode ${data.shortcode} already in use (customer ${existing.code})`);
      }
    }

    // Enforce: at most one OPS_CONTACT marked primary. If none marked, mark
    // the first one (so display logic always has a primary OPS to surface).
    const opsContacts = data.opsContacts ?? [];
    const primaryCount = opsContacts.filter((c) => c.isPrimary).length;
    if (primaryCount > 1) {
      throw new ValidationError("Only one OPS contact may be marked primary");
    }
    if (opsContacts.length > 0 && primaryCount === 0) {
      opsContacts[0] = { ...opsContacts[0], isPrimary: true };
    }

    // Allocate-and-create with one retry on KH-code collision.
    // `allocateCustomerCode` reads the current max outside any lock, so two
    // concurrent creates can compute the same next code; the unique index
    // catches the loser with P2002 → we re-allocate and try again. Shortcode
    // collisions (B2B-only, user-typed) still bubble up as 409.
    const buildCustomerData = (code: string) => ({
      code,
      type: data.type,
      name: data.name,
      shortcode: data.type === "B2B" ? data.shortcode : null,
      taxCode: data.type === "B2B" ? data.taxCode : null,
      representativeName: data.type === "B2B" ? data.representativeName : null,
      residency: data.type === "B2C" ? data.residency : null,
      nationalId:
        data.type === "B2C" && data.residency === "DOMESTIC"
          ? data.nationalId ?? null
          : null,
      passportNumber:
        data.type === "B2C" && data.residency === "FOREIGN"
          ? data.passportNumber ?? null
          : null,
      nationality:
        data.type === "B2C" && data.residency === "FOREIGN"
          ? data.nationality ?? null
          : null,
      address: data.address ?? null,
      district: data.district ?? null,
      city: data.city ?? null,
      preferredRegion: data.preferredRegion ?? null,
      preferredTechnicianId: data.preferredTechnicianId ?? null,
      notes: data.notes ?? null,
      contacts: {
        create: [
          {
            role: "CONTRACT_PARTY" as const,
            scope: "CUSTOMER" as const,
            isPrimary: false,
            name: data.contractParty.name,
            title: data.contractParty.title ?? null,
            phone1: data.contractParty.phone1,
            phone2: data.contractParty.phone2 ?? null,
            email: data.contractParty.email ?? null,
            language: data.contractParty.language,
          },
          ...opsContacts.map((c) => ({
            role: "OPS_CONTACT" as const,
            scope: "CUSTOMER" as const,
            isPrimary: c.isPrimary,
            name: c.name,
            title: c.title ?? null,
            phone1: c.phone1,
            phone2: c.phone2 ?? null,
            email: c.email ?? null,
            language: c.language,
          })),
        ],
      },
    });

    let created;
    let attempt = 0;
    const maxAttempts = 3;
    while (true) {
      attempt += 1;
      const code = await allocateCustomerCode();
      try {
        created = await prisma.customer.create({
          data: buildCustomerData(code),
          include: { contacts: true, sites: true },
        });
        break;
      } catch (err) {
        const isP2002 =
          err && typeof err === "object" && "code" in err &&
          (err as { code: string }).code === "P2002";
        if (!isP2002) throw err;
        const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
        // Code collision is retryable; shortcode collision is user error.
        const codeCollision = target.includes("code");
        if (!codeCollision || attempt >= maxAttempts) throw err;
      }
    }

    await logAudit({
      actorType: "USER",
      actorId: auth.userId,
      action: "CUSTOMER_CREATE",
      entityType: "Customer",
      entityId: created.id,
      after: { code: created.code, type: created.type, name: created.name },
      request,
    });

    return successResponse(created, 201);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return errorResponse("Customer code or shortcode collision — retry", 409, "CONFLICT");
    }
    return toErrorResponse(err);
  }
}
