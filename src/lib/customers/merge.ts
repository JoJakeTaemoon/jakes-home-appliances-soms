/**
 * Customer merge (UC-CM-08).
 *
 * Combine `source` into `target`. ADMIN only. Transactional. All FKs from
 * source repoint to target; source customer becomes `status='INACTIVE'`
 * with a note "merged into {targetCode}".
 *
 * Tables updated:
 *   - Site             (customerId)
 *   - CustomerContact  (customerId)
 *   - Equipment        (customerId)
 *   - Contract         (customerId)
 *   - ServiceRequest   (customerId)
 *   - Visit            (customerId)
 *   - Payment          (customerId)
 *   - NotificationLog  (customerId)
 *   - Document         (customerId)
 *   - AuditLog rows are kept as-is (their entityId may be the source
 *     customer id, which is now INACTIVE but still queryable). A summary
 *     CUSTOMER_MERGE row is written.
 */

import prisma from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

export interface MergeInput {
  sourceId: string;
  targetId: string;
  actorId: string;
}

export interface MergeResult {
  targetId: string;
  sourceId: string;
  moved: Record<string, number>;
}

export async function mergeCustomers(input: MergeInput): Promise<MergeResult> {
  if (input.sourceId === input.targetId) {
    throw new ValidationError("Source and target must differ");
  }
  const [source, target] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: input.sourceId },
      select: { id: true, code: true, name: true, status: true },
    }),
    prisma.customer.findUnique({
      where: { id: input.targetId },
      select: { id: true, code: true, name: true, status: true },
    }),
  ]);
  if (!source) throw new NotFoundError("Source customer not found");
  if (!target) throw new NotFoundError("Target customer not found");
  if (target.status === "INACTIVE") {
    throw new ConflictError("Target customer is inactive");
  }

  const moved = await prisma.$transaction(async (tx) => {
    const sites = await tx.site.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const contacts = await tx.customerContact.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const equipment = await tx.equipment.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const contracts = await tx.contract.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const serviceRequests = await tx.serviceRequest.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const visits = await tx.visit.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const payments = await tx.payment.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const notificationLogs = await tx.notificationLog.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });
    const documents = await tx.document.updateMany({
      where: { customerId: source.id },
      data: { customerId: target.id },
    });

    await tx.customer.update({
      where: { id: source.id },
      data: {
        status: "INACTIVE",
        deactivatedAt: new Date(),
        deactivationReason: `Merged into ${target.code}`,
      },
    });

    return {
      sites: sites.count,
      contacts: contacts.count,
      equipment: equipment.count,
      contracts: contracts.count,
      serviceRequests: serviceRequests.count,
      visits: visits.count,
      payments: payments.count,
      notificationLogs: notificationLogs.count,
      documents: documents.count,
    };
  });

  await logAudit({
    actorType: "USER",
    actorId: input.actorId,
    action: "CUSTOMER_MERGE",
    entityType: "Customer",
    entityId: target.id,
    before: {
      sourceId: source.id,
      sourceCode: source.code,
      sourceName: source.name,
    },
    after: {
      targetId: target.id,
      targetCode: target.code,
      targetName: target.name,
      moved,
    },
  });

  return {
    targetId: target.id,
    sourceId: source.id,
    moved,
  };
}
