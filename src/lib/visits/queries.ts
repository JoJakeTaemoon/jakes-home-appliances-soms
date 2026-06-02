/**
 * Visit query helpers shared between office + mobile API routes.
 *
 * `getVisitOr404` loads the Visit with the standard include shape used by
 * the detail endpoint + permission check, and throws NotFoundError if
 * missing.
 */

import prisma from "@/lib/prisma";
import { NotFoundError } from "@/lib/api/error";

export type VisitDetail = NonNullable<
  Awaited<ReturnType<typeof getVisitOr404>>
>;

export async function getVisitOr404(visitId: string) {
  const v = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      customer: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          address: true,
          district: true,
          city: true,
          preferredTechnicianId: true,
          preferredRegion: true,
          contacts: {
            where: { role: "OPS_CONTACT" },
            select: {
              id: true,
              name: true,
              phone1: true,
              email: true,
              language: true,
              isPrimary: true,
              scope: true,
              siteId: true,
            },
          },
        },
      },
      equipment: {
        select: {
          id: true,
          serialNumber: true,
          installedAt: true,
          model: {
            select: {
              id: true,
              modelCode: true,
              nameKo: true,
              nameVi: true,
              nameEn: true,
              category: true,
              // Filters / consumables compatible with this model — drives
              // the technician-facing "scope of work" section so the field
              // visit detail can show "replace pre-filter / clean post
              // carbon / etc." right next to the equipment block.
              consumables: {
                select: {
                  quantity: true,
                  consumable: {
                    select: {
                      id: true,
                      sku: true,
                      nameKo: true,
                      nameVi: true,
                      nameEn: true,
                      replaceEveryMonths: true,
                      cleanEveryMonths: true,
                      cleanOnEveryVisit: true,
                      isActive: true,
                    },
                  },
                },
              },
            },
          },
          site: { select: { id: true, name: true, region: true, address: true } },
        },
      },
      leadTechnician: {
        select: { id: true, username: true, phone: true, preferredRegion: true },
      },
      payments: {
        select: {
          id: true,
          method: true,
          state: true,
          expectedAmount: true,
          actualAmount: true,
          collectedAt: true,
        },
      },
      documents: {
        select: {
          id: true,
          kind: true,
          filename: true,
          generatedAt: true,
          storageKey: true,
        },
        orderBy: { generatedAt: "desc" },
      },
      serviceRequest: {
        select: {
          id: true,
          code: true,
          type: true,
          state: true,
          description: true,
          isPaid: true,
        },
      },
    },
  });
  if (!v) throw new NotFoundError("Visit not found");
  return v;
}

/** Hydrate collaborator usernames by id (small set; OK to issue one query). */
export async function loadCollaborators(ids: string[]) {
  if (!ids || ids.length === 0) return [] as { id: string; username: string; phone: string | null }[];
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, phone: true },
  });
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter(Boolean) as {
    id: string;
    username: string;
    phone: string | null;
  }[];
}
