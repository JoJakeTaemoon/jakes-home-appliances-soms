/**
 * GET  /api/customers/[id]/sites — list sites.
 * POST /api/customers/[id]/sites — create site (B2B only).
 */

import { z } from "zod";
import prisma from "@/lib/prisma";
import { defineMutation, defineQuery } from "@/lib/api/mutation";
import { canManageSite, canViewCustomer } from "@/lib/customers/access";
import { createSiteSchema } from "@/lib/validators/site";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";

const paramsSchema = z.object({ id: z.string() });

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!canViewCustomer(auth.role))
      throw new ForbiddenError("Cannot view customers");
  },
  params: paramsSchema,
  handler: async ({ params }) =>
    prisma.site.findMany({
      where: { customerId: params.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { equipment: true, contacts: true } } },
    }),
});

export const POST = defineMutation({
  audience: "staff",
  authorize: (auth) => {
    if (!canManageSite(auth.role))
      throw new ForbiddenError("Cannot manage sites");
  },
  params: paramsSchema,
  body: createSiteSchema,
  successStatus: 201,
  handler: async ({ body, params }) => {
    const customerId = params.id;
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");
    if (customer.type !== "B2B") {
      throw new ValidationError("Sites are only available for B2B customers");
    }
    return prisma.site.create({
      data: {
        customerId,
        name: body.name,
        addressProvinceCode: body.addressProvinceCode ?? null,
        addressProvinceName: body.addressProvinceName ?? null,
        addressDistrictCode: body.addressDistrictCode ?? null,
        addressDistrictName: body.addressDistrictName ?? null,
        addressWardCode: body.addressWardCode ?? null,
        addressWardName: body.addressWardName ?? null,
        addressStreet: body.addressStreet ?? null,
        // Mirror into deprecated columns so legacy read paths keep working.
        address: body.addressStreet ?? null,
        district: body.addressDistrictName ?? null,
        city: body.addressProvinceName ?? null,
        region: body.region ?? null,
        notes: body.notes ?? null,
      },
    });
  },
  audit: {
    action: "SITE_CREATE",
    entityType: "Site",
    after: (r) => r,
  },
});
