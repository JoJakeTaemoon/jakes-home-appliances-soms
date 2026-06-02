/**
 * GET /api/mobile/parts
 *
 * TECHNICIAN-only. Flat list of all active consumables + accessories,
 * used to power the parts-search dropdown in the visit-completion
 * wizard. Returns trilingual labels so the mobile UI can render the
 * technician's preferred locale without an extra round trip.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";

export interface MobilePart {
  id: string;
  sku: string;
  nameKo: string;
  nameVi: string;
  nameEn: string;
  kind: "CONSUMABLE" | "ACCESSORY";
  retailPrice: string;
}

export const GET = defineQuery({
  audience: "field",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  handler: async (): Promise<MobilePart[]> => {
    const [consumables, accessories] = await Promise.all([
      prisma.consumable.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          nameKo: true,
          nameVi: true,
          nameEn: true,
          retailPrice: true,
        },
        orderBy: { sku: "asc" },
      }),
      prisma.accessory.findMany({
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          nameKo: true,
          nameVi: true,
          nameEn: true,
          retailPrice: true,
        },
        orderBy: { sku: "asc" },
      }),
    ]);

    return [
      ...consumables.map((c) => ({
        id: c.id,
        sku: c.sku,
        nameKo: c.nameKo,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        kind: "CONSUMABLE" as const,
        retailPrice: c.retailPrice.toString(),
      })),
      ...accessories.map((a) => ({
        id: a.id,
        sku: a.sku,
        nameKo: a.nameKo,
        nameVi: a.nameVi,
        nameEn: a.nameEn,
        kind: "ACCESSORY" as const,
        retailPrice: a.retailPrice.toString(),
      })),
    ];
  },
});
