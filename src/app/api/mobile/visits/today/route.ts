/**
 * GET /api/mobile/visits/today
 *
 * TECHNICIAN-only. Returns the calling technician's visits scheduled today,
 * split into `lead` and `collaborator` buckets. Sorted by scheduledFor asc.
 */

import prisma from "@/lib/prisma";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import { dayBounds } from "@/lib/scheduler/availability";
import {
  suggestVisitDocumentKind,
  type CustomerTypeForSuggest,
  type VisitTypeForSuggest,
} from "@/lib/visits/document-suggest";

const ACTIVE_STATES = ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] as const;

export const GET = defineQuery({
  audience: "field",
  authorize: (auth) => {
    if (auth.role !== "TECHNICIAN") {
      throw new ForbiddenError("Mobile endpoints are technician-only");
    }
  },
  handler: async ({ auth }) => {
    const { start, end } = dayBounds(new Date());
    const visits = await prisma.visit.findMany({
      where: {
        scheduledFor: { gte: start, lt: end },
        state: { in: [...ACTIVE_STATES] },
        OR: [
          { leadTechnicianId: auth.userId },
          { collaboratorTechnicianIds: { has: auth.userId } },
        ],
      },
      orderBy: { scheduledFor: "asc" },
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
            // Phone intentionally omitted — technicians call HQ, not customers.
            contacts: {
              where: { role: "OPS_CONTACT", isPrimary: true },
              select: { name: true },
            },
          },
        },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: { select: { modelCode: true, nameKo: true, nameVi: true, nameEn: true } },
          },
        },
      },
    });

    // Resolve the latest active contract type per customer so we can
    // suggest the right signature document (RENTAL → delivery receipt,
    // SALE → sale receipt). One query for the whole bundle.
    const customerIds = Array.from(new Set(visits.map((v) => v.customerId)));
    const contracts = customerIds.length
      ? await prisma.contract.findMany({
          where: {
            customerId: { in: customerIds },
            state: { in: ["ACTIVE", "PENDING_SIGNATURE", "AMENDED"] },
          },
          orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
          select: { customerId: true, type: true },
        })
      : [];
    const latestContractTypeByCustomer = new Map<
      string,
      "RENTAL" | "SALE" | "MAINTENANCE"
    >();
    for (const c of contracts) {
      if (!latestContractTypeByCustomer.has(c.customerId)) {
        latestContractTypeByCustomer.set(c.customerId, c.type);
      }
    }

    function enrich<V extends (typeof visits)[number]>(v: V) {
      const contractType =
        latestContractTypeByCustomer.get(v.customerId) ?? null;
      const docKind = suggestVisitDocumentKind({
        visitType: v.type as VisitTypeForSuggest,
        customerType: v.customer.type as CustomerTypeForSuggest,
        contractType,
      });
      // INSTALLATION visits also need the contract — tech carries both.
      const signatureDocs: string[] = [docKind];
      if (v.type === "INSTALLATION" && contractType !== null) {
        signatureDocs.push("CONTRACT");
      }
      return { ...v, signatureDocs };
    }

    const lead = visits
      .filter((v) => v.leadTechnicianId === auth.userId)
      .map(enrich);
    const collaborator = visits
      .filter((v) => v.leadTechnicianId !== auth.userId)
      .map(enrich);
    return { lead, collaborator };
  },
});
