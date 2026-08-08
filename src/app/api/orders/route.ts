/**
 * GET  /api/orders — paginated list with filters.
 * POST /api/orders — create order with line items, auto-assigning order#.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { defineQuery } from "@/lib/api/mutation";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/error";
import { successResponse, toErrorResponse } from "@/lib/api/response";
import {
  createOrderSchema,
  formatOrderNumber,
  orderListQuerySchema,
  type CreateOrderInput,
} from "@/lib/validators/order";
import { canManageEquipment } from "@/lib/customers/access";
import { applyStockMove } from "@/lib/inventory/moves";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import {
  deliveryKindForCustomerType,
  issueVisitDocument,
} from "@/lib/visits/issue-document";
import { canIssueVisitDocument } from "@/lib/visits/document-policy";

/**
 * A delivered order consumes stock. Only CONSUMABLE lines decrement here —
 * EQUIPMENT lines move stock when the unit is installed (POST /api/equipment),
 * so decrementing them here too would double-count.
 *
 * ponytail: the two APIs aren't linked, so an EQUIPMENT order whose install is
 * never registered under-counts that model's stock; the office reconciles with
 * a manual 조정. Upgrade path: tie the order's equipment line to the created
 * Equipment row and verify.
 */
async function decrementDeliveredConsumables(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    items: Array<{
      productKind: string;
      consumableId: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }>;
  },
  actorId: string,
): Promise<void> {
  for (const it of order.items) {
    if (it.productKind === "CONSUMABLE" && it.consumableId) {
      await applyStockMove(tx, {
        itemKind: "CONSUMABLE",
        consumableId: it.consumableId,
        direction: "OUT",
        quantity: it.quantity,
        reason: "SALE",
        unitPrice: Number(it.unitPrice),
        sourceType: "ORDER",
        sourceId: order.id,
        createdById: actorId,
      });
    }
  }
}

/**
 * Verify FKs on the create-order payload (serviceRequest + equipment
 * belong to the same customer) and resolve the site to land the
 * auto-spawned visit on. Returns the effective siteId.
 */
async function resolveSiteAndValidateLinks(
  data: CreateOrderInput,
): Promise<string | null> {
  if (data.serviceRequestId) {
    const sr = await prisma.serviceRequest.findUnique({
      where: { id: data.serviceRequestId },
      select: { customerId: true },
    });
    if (sr?.customerId !== data.customerId) {
      throw new ValidationError(
        "Service request does not belong to this customer",
      );
    }
  }
  let resolvedSiteId: string | null = data.siteId ?? null;
  if (data.equipmentId) {
    const eq = await prisma.equipment.findUnique({
      where: { id: data.equipmentId },
      select: { customerId: true, siteId: true },
    });
    if (eq?.customerId !== data.customerId) {
      throw new ValidationError(
        "Equipment does not belong to this customer",
      );
    }
    resolvedSiteId ??= eq.siteId;
  }
  return resolvedSiteId;
}

export const GET = defineQuery({
  audience: "staff",
  query: orderListQuerySchema,
  paginated: true,
  handler: async ({ query }) => {
    const { q, customerId, equipmentId, contractId, state, productKind, from, to, page, pageSize } = query;
    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (equipmentId) where.equipmentId = equipmentId;
    if (contractId) where.contractId = contractId;
    if (state) where.state = state;
    if (productKind) {
      where.items = { some: { productKind } };
    }
    if (from || to) {
      where.orderedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ];
    }
    const skip = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { orderedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          customer: { select: { id: true, code: true, name: true } },
          equipment: { select: { id: true, serialNumber: true } },
          items: true,
        },
      }),
    ]);
    return { rows, pagination: { page, limit: pageSize, total } };
  },
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!canManageEquipment(auth.role)) {
      throw new ForbiddenError("Cannot create orders");
    }
    const body = await request.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid order payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const data = parsed.data;

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, type: true },
    });
    if (!customer) throw new NotFoundError("Customer not found");
    // Customer type drives which delivery document kind is queued /
    // rendered — B2C rental gets DELIVERY_RECEIPT, B2B install gets
    // Mẫu số 02-VT DELIVERY_SLIP_B2B.
    const deliveryKind = deliveryKindForCustomerType(customer.type);

    // ServiceRequest + equipment link sanity-check — must belong to the
    // same customer so a malicious payload can't attribute someone
    // else's SR / equipment to this order. Equipment lookup also
    // returns the device's site so the auto-spawned visit lands on the
    // right Site for B2B multi-site customers (same rule as POST
    // /api/visits).
    const resolvedSiteId = await resolveSiteAndValidateLinks(data);

    // Find next sequence for orderedAt's calendar date.
    let attempt = 0;
    while (attempt < 5) {
      const dayStart = new Date(data.orderedAt);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const sameDayCount = await prisma.order.count({
        where: { orderedAt: { gte: dayStart, lt: dayEnd } },
      });
      const seq = sameDayCount + 1 + attempt;
      const orderNumber = formatOrderNumber(data.orderedAt, seq);
      try {
        // Track whether the visit is already SCHEDULED with a lead
        // technician at the end of the tx — if so, we render the
        // delivery doc immediately (outside the tx to keep the PDF
        // heavy-lifting off the DB connection). Otherwise the kind
        // sits in Visit.pendingDocumentKinds until schedule fires.
        let renderImmediately = false;
        const created = await prisma.$transaction(async (tx) => {
          // 1) Visit — either create a new one or attach to an
          //    already-scheduled one for the same customer.
          let visitId: string | null = null;
          if (data.visit) {
            const visit = await tx.visit.create({
              data: {
                customerId: data.customerId,
                siteId: resolvedSiteId,
                equipmentId: data.equipmentId ?? null,
                type: data.visit.type,
                state: "SUGGESTED",
                scheduledFor: data.visit.scheduledFor,
                leadTechnicianId: data.visit.leadTechnicianId ?? null,
                // Fresh visit — always queue the delivery kind.
                // Schedule will drain it once the office confirms.
                pendingDocumentKinds: [deliveryKind],
                officeNotes: data.visit.notes
                  ? [
                      {
                        at: new Date().toISOString(),
                        authorId: auth.userId,
                        authorName: null,
                        text: data.visit.notes,
                      },
                    ]
                  : undefined,
              },
            });
            visitId = visit.id;
          } else if (data.attachToVisitId) {
            // Reload for FK sanity + to fetch the existing additional
            // types / pending kinds / state — we may render immediately
            // or extend the queue based on where the visit stands.
            const existing = await tx.visit.findUnique({
              where: { id: data.attachToVisitId },
              select: {
                id: true,
                customerId: true,
                type: true,
                state: true,
                leadTechnicianId: true,
                additionalTypes: true,
                pendingDocumentKinds: true,
              },
            });
            if (!existing || existing.customerId !== data.customerId) {
              throw new ValidationError(
                "Attached visit does not belong to this customer",
              );
            }
            // Append CONSUMABLE_DELIVERY unless the primary type is
            // already that or it's already in the additionalTypes set.
            const alreadyTyped =
              existing.type === "CONSUMABLE_DELIVERY" ||
              existing.additionalTypes.includes("CONSUMABLE_DELIVERY");
            const nextAdditional = alreadyTyped
              ? existing.additionalTypes
              : [...existing.additionalTypes, "CONSUMABLE_DELIVERY" as const];
            // Queue the delivery doc unless the same kind is already
            // pending or a prior document of the kind already exists on
            // the visit (idempotent under repeat attach).
            const alreadyPending =
              existing.pendingDocumentKinds.includes(deliveryKind);
            const priorDoc = alreadyPending
              ? null
              : await tx.document.findFirst({
                  where: { visitId: existing.id, kind: deliveryKind },
                  select: { id: true },
                });
            const shouldQueue = !alreadyPending && !priorDoc;
            const nextPending = shouldQueue
              ? [...existing.pendingDocumentKinds, deliveryKind]
              : existing.pendingDocumentKinds;
            if (!alreadyTyped || shouldQueue) {
              await tx.visit.update({
                where: { id: existing.id },
                data: {
                  additionalTypes: nextAdditional,
                  pendingDocumentKinds: nextPending,
                },
              });
            }
            // If the visit is already SCHEDULED with a lead tech, we
            // can render the delivery doc as soon as the tx commits —
            // no waiting for a separate schedule step.
            const policy = canIssueVisitDocument({
              state: existing.state,
              leadTechnicianId: existing.leadTechnicianId,
            });
            if (shouldQueue && policy.allowed) {
              renderImmediately = true;
            }
            visitId = existing.id;
          }
          // 2) Order — pin the visit + SR FK so the modal-driven
          //    flow is fully linked end-to-end in one round trip.
          const order = await tx.order.create({
            data: {
              orderNumber,
              customerId: data.customerId,
              equipmentId: data.equipmentId ?? null,
              siteId: resolvedSiteId,
              contractId: data.contractId ?? null,
              visitId,
              serviceRequestId: data.serviceRequestId ?? null,
              orderedAt: data.orderedAt,
              deliveredAt: data.deliveredAt ?? null,
              state: data.state,
              notes: data.notes ?? null,
              createdById: auth.userId,
              items: {
                create: data.items.map((it) => ({
                  productKind: it.productKind,
                  consumableId: it.consumableId ?? null,
                  equipmentModelId: it.equipmentModelId ?? null,
                  customName: it.customName ?? null,
                  equipmentId: it.equipmentId ?? null,
                  quantity: it.quantity,
                  unitPrice: it.unitPrice,
                  totalPrice: it.totalPrice,
                  purpose: it.purpose ?? null,
                  notes: it.notes ?? null,
                })),
              },
            },
            include: { items: true, visit: true },
          });
          if (order.state === "DELIVERED") {
            await decrementDeliveredConsumables(tx, order, auth.userId);
          }
          return order;
        });
        await logAudit({
          actorType: "USER",
          actorId: auth.userId,
          action: "ORDER_CREATE",
          entityType: "Order",
          entityId: created.id,
          after: {
            orderNumber: created.orderNumber,
            customerId: created.customerId,
            itemCount: created.items.length,
            visitId: created.visitId,
            serviceRequestId: created.serviceRequestId,
          },
          request,
        });
        // Attach mode + already-SCHEDULED visit: fire the render now so
        // the office doesn't have to click into the visit to issue the
        // delivery doc. Failures log but don't fail the order create —
        // the kind is still in pendingDocumentKinds so a retry from the
        // visit detail (or the next schedule pass) picks it up.
        if (renderImmediately && created.visitId) {
          try {
            await issueVisitDocument({
              visitId: created.visitId,
              kind: deliveryKind,
              actorId: auth.userId,
              request,
            });
            await prisma.visit.update({
              where: { id: created.visitId },
              data: {
                pendingDocumentKinds: {
                  set: (created.visit?.pendingDocumentKinds ?? []).filter(
                    (k) => k !== deliveryKind,
                  ),
                },
              },
            });
          } catch (renderErr) {
            console.error(
              "[orders] auto-issue delivery doc failed:",
              renderErr,
            );
          }
        }
        return successResponse(created, 201);
      } catch (err) {
        const isP2002 =
          err && typeof err === "object" && "code" in err &&
          (err as { code: string }).code === "P2002";
        if (!isP2002) throw err;
        attempt += 1;
      }
    }
    throw new Error("Could not allocate order number after 5 attempts");
  } catch (err) {
    return toErrorResponse(err);
  }
}
