/**
 * Order state moves — PENDING → DELIVERED | CANCELLED.
 *
 * Shared by POST /api/orders (an order created already DELIVERED),
 * PATCH /api/orders/[id] (office 「전달 완료」 / 「취소」) and visit completion
 * (a CONSUMABLE_DELIVERY visit hands the goods over). DELIVERED and CANCELLED
 * are terminal.
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { applyStockMove } from "@/lib/inventory/moves";
import { ConflictError, NotFoundError } from "@/lib/api/error";
import type { Prisma } from "@/generated/prisma/client";

export type OrderTarget = "DELIVERED" | "CANCELLED";

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
export async function decrementDeliveredConsumables(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    items: Array<{
      productKind: string;
      consumableId: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal | { toString(): string };
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
        unitPrice: Number(it.unitPrice.toString()),
        sourceType: "ORDER",
        sourceId: order.id,
        createdById: actorId,
      });
    }
  }
}

/**
 * Move one PENDING order to DELIVERED or CANCELLED. The prior state is pinned
 * in the UPDATE's WHERE, so a concurrent move loses with a 409 instead of
 * double-decrementing stock. Audits ORDER_DELIVER / ORDER_CANCEL.
 */
export async function transitionOrder(args: {
  orderId: string;
  to: OrderTarget;
  actorId: string;
  deliveredAt?: Date;
  request?: NextRequest;
}) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: args.orderId },
      include: { items: true },
    });
    if (!current) throw new NotFoundError("Order not found");

    const data =
      args.to === "DELIVERED"
        ? { state: args.to, deliveredAt: args.deliveredAt ?? new Date() }
        : { state: args.to };
    const { count } = await tx.order.updateMany({
      where: { id: args.orderId, state: "PENDING" },
      data,
    });
    if (count === 0) {
      throw new ConflictError(`Order is ${current.state}; only a PENDING order can change state`);
    }
    if (args.to === "DELIVERED") {
      await decrementDeliveredConsumables(tx, current, args.actorId);
    }
    return { ...current, ...data };
  });

  await logAudit({
    actorType: "USER",
    actorId: args.actorId,
    action: args.to === "DELIVERED" ? "ORDER_DELIVER" : "ORDER_CANCEL",
    entityType: "Order",
    entityId: order.id,
    before: { state: "PENDING" },
    after: {
      orderNumber: order.orderNumber,
      state: order.state,
      deliveredAt: order.deliveredAt ?? null,
      visitId: order.visitId ?? null,
    },
    request: args.request,
  });
  return order;
}

/**
 * Visit completion hook: deliver every PENDING order linked to the visit.
 * Orders someone moved in the meantime (409) are skipped. Returns the ids
 * that were delivered.
 */
export async function deliverPendingOrdersForVisit(
  visitId: string,
  actorId: string,
): Promise<string[]> {
  const pending = await prisma.order.findMany({
    where: { visitId, state: "PENDING" },
    select: { id: true },
  });
  const delivered: string[] = [];
  for (const { id } of pending) {
    try {
      await transitionOrder({ orderId: id, to: "DELIVERED", actorId });
      delivered.push(id);
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
    }
  }
  return delivered;
}
