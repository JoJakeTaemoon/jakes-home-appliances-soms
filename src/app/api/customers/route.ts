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
  salesRep: (dir) => ({ salesRep: { username: dir } }),
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
    const {
      q,
      type,
      status,
      region,
      salesRepId,
      contractState,
      sortBy,
      sortDir,
      page,
      pageSize,
    } = query;
    const orderBy = resolveOrderBy({ sortBy, sortDir }, CUSTOMER_SORT_MAP, { code: "asc" });

    const where: Prisma.CustomerWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (region) where.preferredRegion = region;
    if (salesRepId) where.salesRepId = salesRepId;
    if (contractState) {
      switch (contractState) {
        case "ACTIVE":
          where.contracts = { some: { state: "ACTIVE" } };
          break;
        case "EXPIRING": {
          const now = new Date();
          const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          where.contracts = {
            some: { state: "ACTIVE", endDate: { gte: now, lte: in30 } },
          };
          break;
        }
        case "TERMINATED":
          where.contracts = {
            some: { state: { in: ["TERMINATED", "COMPLETED"] } },
          };
          break;
        case "NONE":
          where.contracts = { none: {} };
          break;
      }
    }
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
            select: { id: true, name: true, title: true, phone1: true, email: true },
          },
          salesRep: {
            select: { id: true, username: true, title: true, avatarUrl: true },
          },
          _count: {
            select: { equipment: true, sites: true, contracts: true },
          },
        },
      }),
    ]);

    // Augment each row with: activeContracts, activeEquipment, nextMaintenanceAt.
    // Done as a batched query so we avoid an N+1 for /api/customers.
    const customerIds = rows.map((r) => r.id);
    const [activeContracts, activeEquipment, nextVisits] = await Promise.all([
      customerIds.length === 0
        ? []
        : prisma.contract.groupBy({
            by: ["customerId"],
            where: { customerId: { in: customerIds }, state: "ACTIVE" },
            _count: { _all: true },
          }),
      customerIds.length === 0
        ? []
        : prisma.equipment.groupBy({
            by: ["customerId"],
            where: {
              customerId: { in: customerIds },
              status: { not: "REPLACED" },
              lifecycleStage: { in: ["INSTALLED", "IN_RENTAL", "IN_MAINTENANCE"] },
            },
            _count: { _all: true },
          }),
      customerIds.length === 0
        ? []
        : prisma.visit.findMany({
            where: {
              customerId: { in: customerIds },
              state: { in: ["SUGGESTED", "SCHEDULED"] },
              type: { in: ["PERIODIC_INSPECTION", "INSTALLATION"] },
            },
            select: { customerId: true, scheduledFor: true },
            orderBy: { scheduledFor: "asc" },
          }),
    ]);
    const activeContractMap = new Map(activeContracts.map((r) => [r.customerId, r._count._all]));
    const activeEquipmentMap = new Map(activeEquipment.map((r) => [r.customerId, r._count._all]));
    const nextVisitMap = new Map<string, Date>();
    for (const v of nextVisits) {
      if (!nextVisitMap.has(v.customerId)) nextVisitMap.set(v.customerId, v.scheduledFor);
    }

    const augmented = rows.map((row) => ({
      ...row,
      activeContractCount: activeContractMap.get(row.id) ?? 0,
      activeEquipmentCount: activeEquipmentMap.get(row.id) ?? 0,
      nextMaintenanceAt: nextVisitMap.get(row.id) ?? null,
    }));

    return { rows: augmented, pagination: { page, limit: pageSize, total } };
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
      residency: data.type === "B2C" ? data.residency : null,
      nationalId: data.type === "B2C" ? data.nationalId ?? null : null,
      passportNumber: data.type === "B2C" ? data.passportNumber ?? null : null,
      nationality: data.type === "B2C" ? data.nationality ?? null : null,
      documentIssueDate: data.documentIssueDate ?? null,
      documentIssuePlace: data.documentIssuePlace ?? null,
      addressProvinceCode: data.addressProvinceCode ?? null,
      addressProvinceName: data.addressProvinceName ?? null,
      addressDistrictCode: data.addressDistrictCode ?? null,
      addressDistrictName: data.addressDistrictName ?? null,
      addressWardCode: data.addressWardCode ?? null,
      addressWardName: data.addressWardName ?? null,
      addressStreet: data.addressStreet ?? null,
      // Mirror structured address into deprecated columns so legacy read paths
      // (PDF templates, list search) keep working until they're migrated.
      address: data.addressStreet ?? null,
      district: data.addressDistrictName ?? null,
      city: data.addressProvinceName ?? null,
      preferredRegion: data.preferredRegion ?? null,
      preferredTechnicianId: data.preferredTechnicianId ?? null,
      salesRepId: data.salesRepId ?? null,
      notes: data.notes ?? null,
      contacts: {
        create: [
          // For B2C the customer IS the contract party — fork name/phone/email
          // /language from the top-level customer fields. For B2B the form
          // collects a separate CONTRACT_PARTY (different person, e.g. CEO).
          data.type === "B2C"
            ? {
                role: "CONTRACT_PARTY" as const,
                scope: "CUSTOMER" as const,
                isPrimary: false,
                name: data.name,
                title: null,
                phone1: data.phone,
                phone2: null,
                email: data.email ?? null,
                language: data.language,
              }
            : {
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
