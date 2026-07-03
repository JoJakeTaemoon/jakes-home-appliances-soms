import { Prisma } from "@/generated/prisma";

/**
 * Recalculate Contract.deposit + Contract.monthlyMaintenanceFee from the
 * equipment lines attached to this contract.
 *
 * After the 2026-06 equipment-centric domain shift, the source of truth for
 * pricing is `Equipment.deposit` / `Equipment.monthlyFee`. Contract still
 * carries the columns as SUM caches so existing reports (PDF totals, filter
 * queries, exports) keep working without rewrites — this function is what
 * keeps them honest.
 *
 * Call this:
 *   - after creating/updating/deleting an Equipment row that's attached to
 *     a contract via ContractEquipment;
 *   - after adding/removing a ContractEquipment row;
 *   - after an Equipment lifecycleStage transition (IN_RENTAL → REPLACED).
 *
 * Pass a tx client when calling from inside a transaction; otherwise pass
 * the bare prisma client. Returns the new totals for convenience.
 */
export async function recalculateContractCache(
  tx: Prisma.TransactionClient | { contract: Prisma.ContractDelegate; contractEquipment: Prisma.ContractEquipmentDelegate; equipment: Prisma.EquipmentDelegate },
  contractId: string,
): Promise<{ deposit: number; monthlyMaintenanceFee: number; totalContractValue: number | null }> {
  const rows = await (tx as Prisma.TransactionClient).contractEquipment.findMany({
    where: { contractId },
    select: {
      quantity: true,
      equipment: {
        select: {
          deposit: true,
          monthlyFee: true,
          lifecycleStage: true,
        },
      },
    },
  });

  let deposit = 0;
  let monthlyMaintenanceFee = 0;
  const VALID_STAGES = new Set(["INSTALLED", "IN_RENTAL", "IN_MAINTENANCE"]);
  for (const row of rows) {
    if (!row.equipment) continue;
    // Skip retrieved/replaced — they don't contribute to the live cache.
    if (!VALID_STAGES.has(row.equipment.lifecycleStage)) continue;
    const qty = row.quantity ?? 1;
    deposit += Number(row.equipment.deposit ?? 0) * qty;
    monthlyMaintenanceFee += Number(row.equipment.monthlyFee ?? 0) * qty;
  }

  const contract = await (tx as Prisma.TransactionClient).contract.findUnique({
    where: { id: contractId },
    select: { type: true, termMonths: true },
  });

  let totalContractValue: number | null = null;
  if (contract?.type === "RENTAL" && contract.termMonths) {
    totalContractValue = deposit + monthlyMaintenanceFee * contract.termMonths;
  } else if (contract?.type === "MAINTENANCE" && contract.termMonths) {
    totalContractValue = monthlyMaintenanceFee * contract.termMonths;
  }

  await (tx as Prisma.TransactionClient).contract.update({
    where: { id: contractId },
    data: {
      deposit: new Prisma.Decimal(deposit),
      monthlyMaintenanceFee: new Prisma.Decimal(monthlyMaintenanceFee),
      totalContractValue: totalContractValue === null ? null : new Prisma.Decimal(totalContractValue),
    },
  });

  return { deposit, monthlyMaintenanceFee, totalContractValue };
}

/**
 * Recalculate every contract the given equipment row belongs to. Handy when
 * a single Equipment.update touches deposit/monthlyFee/lifecycleStage and you
 * don't want callers to know which contracts to refresh.
 */
export async function recalculateContractsForEquipment(
  tx: Prisma.TransactionClient,
  equipmentId: string,
): Promise<void> {
  const links = await tx.contractEquipment.findMany({
    where: { equipmentId },
    select: { contractId: true },
  });
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.contractId)) continue;
    seen.add(link.contractId);
    await recalculateContractCache(tx, link.contractId);
  }
}
