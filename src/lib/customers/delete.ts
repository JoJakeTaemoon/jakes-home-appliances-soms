/**
 * 고객 삭제 (2026-10-26) — hard delete, MANAGER+.
 *
 * Everything attached to the customer is handled in four groups, each either
 * moved to one target customer or deleted with it:
 *   operations — equipment · contracts · visits · payments (they point at each
 *                other, so they always travel together)
 *   contacts   — contacts · sites
 *   requests   — service requests · orders
 *   records    — notification logs · documents
 * Every reference that crosses groups is SetNull, so any mix is safe: e.g.
 * moved equipment whose site is deleted just loses its site. Moved contacts
 * join as operations contacts — the target already has its contract party —
 * and never take over its primary flag. The audit row records what went where.
 */
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export const DELETE_GROUPS = ["operations", "contacts", "requests", "records"] as const;
export type DeleteGroup = (typeof DELETE_GROUPS)[number];
export type GroupAction = "MOVE" | "DELETE";

export async function customerDeletionPreview(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  const where = { customerId };
  const [equipment, contracts, visits, payments, contacts, sites, serviceRequests, orders, notificationLogs, documents] =
    await Promise.all([
      prisma.equipment.count({ where }),
      prisma.contract.count({ where }),
      prisma.visit.count({ where }),
      prisma.payment.count({ where }),
      prisma.customerContact.count({ where }),
      prisma.site.count({ where }),
      prisma.serviceRequest.count({ where }),
      prisma.order.count({ where }),
      prisma.notificationLog.count({ where }),
      prisma.document.count({ where }),
    ]);
  return {
    customer,
    groups: {
      operations: { equipment, contracts, visits, payments },
      contacts: { contacts, sites },
      requests: { serviceRequests, orders },
      records: { notificationLogs, documents },
    },
  };
}

export interface DeleteCustomerInput {
  customerId: string;
  actions: Record<DeleteGroup, GroupAction>;
  targetCustomerId?: string | null;
  confirmCode: string;
  actorId: string;
}

export async function deleteCustomer(input: DeleteCustomerInput) {
  const before = await customerDeletionPreview(input.customerId);
  const source = before.customer;
  if (input.confirmCode.trim() !== source.code) {
    throw new ValidationError("Type the customer code to confirm", [{ path: ["confirmCode"], message: "mismatch" }]);
  }
  const moving = DELETE_GROUPS.filter((g) => input.actions[g] === "MOVE");
  let target: { id: string; code: string; name: string; status: string } | null = null;
  if (moving.length) {
    if (!input.targetCustomerId) {
      throw new ValidationError("A target customer is required to move data", [{ path: ["targetCustomerId"], message: "required" }]);
    }
    if (input.targetCustomerId === source.id) throw new ValidationError("Target must be another customer");
    target = await prisma.customer.findUnique({
      where: { id: input.targetCustomerId },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!target) throw new NotFoundError("Target customer not found");
    if (target.status === "INACTIVE") throw new ConflictError("Target customer is inactive");
  }

  const from = { customerId: source.id };
  const to = { customerId: target?.id ?? "" };
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      if (input.actions.operations === "MOVE") {
        await tx.equipment.updateMany({ where: from, data: to });
        await tx.contract.updateMany({ where: from, data: to });
        await tx.visit.updateMany({ where: from, data: to });
        await tx.payment.updateMany({ where: from, data: to });
      } else {
        // Payments and contracts block the customer delete; contract lines
        // block the equipment delete — so this order. Tax invoices, contract
        // lines, visit logs and unit filter rows cascade.
        await tx.payment.deleteMany({ where: from });
        await tx.contract.deleteMany({ where: from });
        await tx.visit.deleteMany({ where: from });
        await tx.equipment.deleteMany({ where: from });
      }

      if (input.actions.requests === "MOVE") {
        await tx.serviceRequest.updateMany({ where: from, data: to });
        await tx.order.updateMany({ where: from, data: to });
      } else {
        await tx.order.deleteMany({ where: from });
        await tx.serviceRequest.deleteMany({ where: from });
      }

      if (input.actions.contacts === "MOVE") {
        await tx.site.updateMany({ where: from, data: to });
        await tx.customerContact.updateMany({
          where: from,
          data: { ...to, role: "OPS_CONTACT", isPrimary: false },
        });
        // The target had no operations contact of its own: the first moved one leads.
        const hasPrimary = await tx.customerContact.count({ where: { ...to, role: "OPS_CONTACT", isPrimary: true } });
        if (!hasPrimary) {
          const first = await tx.customerContact.findFirst({ where: { ...to, role: "OPS_CONTACT" }, orderBy: { createdAt: "asc" } });
          if (first) await tx.customerContact.update({ where: { id: first.id }, data: { isPrimary: true } });
        }
      } else {
        await tx.customerContact.deleteMany({ where: from });
        await tx.site.deleteMany({ where: from });
      }

      if (input.actions.records === "MOVE") {
        await tx.notificationLog.updateMany({ where: from, data: to });
        await tx.document.updateMany({ where: from, data: to });
      } else {
        await tx.notificationLog.deleteMany({ where: from });
        await tx.document.deleteMany({ where: from });
      }

      await tx.customer.delete({ where: { id: source.id } });
    },
    { timeout: 60_000 },
  );

  // Flat for the audit drawer's shallow diff.
  const summary = Object.fromEntries(
    DELETE_GROUPS.map((g) => [
      g,
      `${input.actions[g] === "MOVE" ? `→ ${target!.code}` : "삭제"} (${Object.entries(before.groups[g])
        .map(([k, n]) => `${k} ${n}`)
        .join(", ")})`,
    ]),
  );
  await logAudit({
    actorType: "USER",
    actorId: input.actorId,
    action: "CUSTOMER_DELETE",
    entityType: "Customer",
    entityId: source.id,
    before: { code: source.code, name: source.name, type: source.type },
    after: { deleted: true, target: target ? `${target.code} ${target.name}` : null, ...summary },
  });
  return { deletedId: source.id, target: target ? { id: target.id, code: target.code } : null };
}
