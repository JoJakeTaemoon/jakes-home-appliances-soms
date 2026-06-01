/**
 * Batch-resolve (entityType, entityId)[] → display string map.
 *
 * Called from the audit log API after `searchAuditLog()` returns. One query
 * per entityType (deduplicated id lists), so a 50-row page with 6 entity
 * types issues 6 queries — well under the route's overall latency budget.
 *
 * Output key format: `${entityType}:${entityId}`. UI can read `entityDisplay`
 * directly without a second round-trip.
 *
 * Field choices mirror the actual schema:
 *   Customer.name, Site.name, CustomerContact.name, Contract.contractNumber,
 *   Visit.scheduledFor → formatted, User.username, Equipment.serialNumber,
 *   EquipmentModel.nameKo/En/Vi or modelCode, ServiceRequest.code,
 *   Payment.reference or id fallback, Brand.name, ProductCategory.nameKo,
 *   Consumable.nameKo, Accessory.nameKo, ChargePolicy → id (no name field),
 *   TaxInvoice.invoiceNumber or id fallback.
 *
 * Unknown entityTypes are silently ignored. Server-only: do NOT import
 * from client components.
 */

import prisma from "@/lib/prisma";

export interface EntityPair {
  entityType: string;
  entityId: string | null | undefined;
}

type Resolver = (ids: string[]) => Promise<Map<string, string>>;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTime(d: Date | null): string {
  if (!d) return "";
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

function toMap<T>(
  rows: T[],
  idOf: (r: T) => string,
  displayOf: (r: T) => string | null,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const d = displayOf(r);
    if (d) m.set(idOf(r), d);
  }
  return m;
}

const RESOLVERS: Record<string, Resolver> = {
  async Customer(ids) {
    const rows = await prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.name);
  },
  async Site(ids) {
    const rows = await prisma.site.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.name);
  },
  async CustomerContact(ids) {
    const rows = await prisma.customerContact.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.name);
  },
  async Contract(ids) {
    const rows = await prisma.contract.findMany({
      where: { id: { in: ids } },
      select: { id: true, contractNumber: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.contractNumber ?? r.id);
  },
  async Visit(ids) {
    const rows = await prisma.visit.findMany({
      where: { id: { in: ids } },
      select: { id: true, scheduledFor: true },
    });
    return toMap(
      rows,
      (r) => r.id,
      (r) => formatDateTime(r.scheduledFor),
    );
  },
  async User(ids) {
    const rows = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.username);
  },
  async Equipment(ids) {
    const rows = await prisma.equipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, serialNumber: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.serialNumber ?? r.id);
  },
  async EquipmentModel(ids) {
    const rows = await prisma.equipmentModel.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        modelCode: true,
        nameKo: true,
        nameEn: true,
        nameVi: true,
      },
    });
    return toMap(
      rows,
      (r) => r.id,
      (r) => r.nameKo ?? r.nameEn ?? r.nameVi ?? r.modelCode ?? r.id,
    );
  },
  async ServiceRequest(ids) {
    const rows = await prisma.serviceRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.code ?? r.id);
  },
  async Payment(ids) {
    // No `receiptNo`/`name` column on Payment; fall back to reference + id.
    const rows = await prisma.payment.findMany({
      where: { id: { in: ids } },
      select: { id: true, reference: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.reference ?? r.id);
  },
  async Brand(ids) {
    const rows = await prisma.brand.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.name);
  },
  async ProductCategory(ids) {
    const rows = await prisma.productCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameKo: true, nameEn: true, nameVi: true, code: true },
    });
    return toMap(
      rows,
      (r) => r.id,
      (r) => r.nameKo ?? r.nameEn ?? r.nameVi ?? r.code ?? r.id,
    );
  },
  async Consumable(ids) {
    const rows = await prisma.consumable.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameKo: true, nameEn: true, nameVi: true, sku: true },
    });
    return toMap(
      rows,
      (r) => r.id,
      (r) => r.nameKo ?? r.nameEn ?? r.nameVi ?? r.sku ?? r.id,
    );
  },
  async Accessory(ids) {
    const rows = await prisma.accessory.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameKo: true, nameEn: true, nameVi: true, sku: true },
    });
    return toMap(
      rows,
      (r) => r.id,
      (r) => r.nameKo ?? r.nameEn ?? r.nameVi ?? r.sku ?? r.id,
    );
  },
  async ChargePolicy(ids) {
    // ChargePolicy has no human name — show its id.
    const rows = await prisma.chargePolicy.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.id);
  },
  async TaxInvoice(ids) {
    const rows = await prisma.taxInvoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, invoiceNumber: true },
    });
    return toMap(rows, (r) => r.id, (r) => r.invoiceNumber ?? r.id);
  },
};

/**
 * Resolve a page of audit-log (entityType, entityId) pairs to display names.
 * Pairs with a null/undefined entityId are skipped silently.
 */
export async function resolveEntityDisplays(
  pairs: EntityPair[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (pairs.length === 0) return out;

  // Group ids by entityType (deduped).
  const grouped = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!p.entityId) continue;
    if (!(p.entityType in RESOLVERS)) continue;
    let set = grouped.get(p.entityType);
    if (!set) {
      set = new Set<string>();
      grouped.set(p.entityType, set);
    }
    set.add(p.entityId);
  }

  // One query per entity type.
  await Promise.all(
    Array.from(grouped.entries()).map(async ([entityType, idSet]) => {
      const ids = Array.from(idSet);
      try {
        const resolver = RESOLVERS[entityType];
        const m = await resolver(ids);
        for (const [id, display] of m.entries()) {
          out.set(`${entityType}:${id}`, display);
        }
      } catch {
        // Swallow per-type errors — UI just shows the cuid fallback.
      }
    }),
  );

  return out;
}
