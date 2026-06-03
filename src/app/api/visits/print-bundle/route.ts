/**
 * GET /api/visits/print-bundle?date=YYYY-MM-DD&technicianId=<id>&langPair=vi-ko
 *
 * Track 4 — returns the payloads for every visit that the given
 * technician is leading on the given date, suitable for the HTML print
 * page to render one document per visit (stack + page-breaks).
 *
 * Only SCHEDULED / IN_PROGRESS / RESCHEDULED visits are included
 * (CANCELLED / FAILED don't get printed; SUGGESTED are blocked by the
 * document-policy gate). Office STAFF+ only.
 *
 * Each entry resolves the *auto-suggested* DocumentKind via
 * `suggestVisitDocumentKind` — the operator never picks per-visit on
 * the bulk-print path. If the customer's latest contract is missing,
 * INSTALLATION + B2C falls back to DELIVERY_RECEIPT (rental).
 */

import { z } from "zod";
import { defineQuery } from "@/lib/api/mutation";
import { ForbiddenError } from "@/lib/api/error";
import prisma from "@/lib/prisma";
import { VisitWorkflow } from "@/lib/visits/workflow";
import {
  suggestVisitDocumentKind,
  type VisitTypeForSuggest,
  type CustomerTypeForSuggest,
} from "@/lib/visits/document-suggest";
import {
  buildVisitDocumentPayload,
  type VisitDocumentPayload,
} from "@/lib/pdf/visit-preview";
import { langPairForLocale, type PdfLangPair } from "@/lib/pdf/types";

interface ContractRef {
  id: string;
  contractNumber: string;
}

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  technicianId: z.string().min(1),
  langPair: z.enum(["vi-ko", "vi-en"]).optional(),
});

function startEndOfDay(yyyymmdd: string): { start: Date; end: Date } {
  const [y, m, d] = yyyymmdd.split("-").map((p) => Number.parseInt(p, 10));
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

interface BundleEntry {
  visitId: string;
  visitNumber: string;
  scheduledFor: string;
  customerCode: string;
  customerName: string;
  customerType: "B2C" | "B2B";
  visitType: string;
  /** The auto-suggested document for this visit + customer. */
  doc: VisitDocumentPayload;
  /**
   * INSTALLATION visits ship with the same contract PDF the contracts
   * menu shows; the print page embeds it twice (customer + company
   * copy) right above the delivery slip / sale receipt. `null` on
   * non-install visits and on installs with no active contract.
   */
  contract: ContractRef | null;
}

export const GET = defineQuery({
  audience: "staff",
  authorize: (auth) => {
    if (!VisitWorkflow.access.isOfficeRole(auth.role)) {
      throw new ForbiddenError("Cannot use bulk print");
    }
  },
  query: querySchema,
  handler: async ({ query }) => {
    const { start, end } = startEndOfDay(query.date);
    const langPair: PdfLangPair =
      query.langPair ?? langPairForLocale(null);

    const visits = await prisma.visit.findMany({
      where: {
        scheduledFor: { gte: start, lte: end },
        leadTechnicianId: query.technicianId,
        state: { in: ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] },
      },
      select: {
        id: true,
        type: true,
        scheduledFor: true,
        customerId: true,
        customer: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: { scheduledFor: "asc" },
    });

    // Pre-fetch each customer's latest active contract so we can resolve
    // the RENTAL / SALE distinction without N round-trips.
    const customerIds = Array.from(new Set(visits.map((v) => v.customerId)));
    const contracts = customerIds.length
      ? await prisma.contract.findMany({
          where: {
            customerId: { in: customerIds },
            state: { in: ["ACTIVE", "PENDING_SIGNATURE", "AMENDED"] },
          },
          orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            customerId: true,
            type: true,
            contractNumber: true,
          },
        })
      : [];
    const latestContractByCustomer = new Map<
      string,
      {
        id: string;
        contractNumber: string;
        type: "RENTAL" | "SALE" | "MAINTENANCE";
      }
    >();
    for (const c of contracts) {
      if (!latestContractByCustomer.has(c.customerId)) {
        latestContractByCustomer.set(c.customerId, {
          id: c.id,
          contractNumber: c.contractNumber,
          type: c.type,
        });
      }
    }

    const entries: BundleEntry[] = [];
    for (const v of visits) {
      const contract = latestContractByCustomer.get(v.customerId) ?? null;
      const kind = suggestVisitDocumentKind({
        visitType: v.type as VisitTypeForSuggest,
        customerType: v.customer.type as CustomerTypeForSuggest,
        contractType: contract?.type ?? null,
      });
      try {
        const doc = await buildVisitDocumentPayload(v.id, kind, langPair);
        const contractRef: ContractRef | null =
          v.type === "INSTALLATION" && contract
            ? { id: contract.id, contractNumber: contract.contractNumber }
            : null;
        entries.push({
          visitId: v.id,
          visitNumber: v.id.slice(-8).toUpperCase(),
          scheduledFor: v.scheduledFor.toISOString(),
          customerCode: v.customer.code,
          customerName: v.customer.name,
          customerType: v.customer.type as "B2C" | "B2B",
          visitType: v.type,
          doc,
          contract: contractRef,
        });
      } catch (err) {
        // One visit failing to build (e.g. PERIODIC_CHECK_B2C requires
        // equipment + the visit has none) shouldn't blank the whole
        // print bundle. Skip with a console warn — the print page
        // surfaces the missing-row count to the operator.
        console.warn(
          `[print-bundle] skipped visit ${v.id} kind=${kind}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return {
      date: query.date,
      technicianId: query.technicianId,
      langPair,
      entries,
    };
  },
});
