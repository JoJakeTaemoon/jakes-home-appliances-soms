/**
 * Charge policy — decides whether a part (accessory or consumable) is
 * billed to the customer for a specific visit / replacement.
 *
 * Default rules (PDF B.2 / C.2):
 *
 *   RENTAL                 → free (all parts, full coverage)
 *   SALE  + within warranty → free
 *   SALE  + after  warranty → charged
 *   MAINTENANCE + minor part (Accessory.isMinorPart = true)
 *                            → free  (small parts: cocks, valves, hoses…)
 *   MAINTENANCE + major part → charged (compressor, PCB, tank, …)
 *   MAINTENANCE + consumable → free (filters included in maintenance fee
 *                                    per PDF A.5)
 *
 * Anything else falls through to "free" — admins can override with
 * ChargePolicy rows when reality diverges.
 */

import prisma from "@/lib/prisma";

export type ChargeContractType = "RENTAL" | "SALE" | "MAINTENANCE";

export interface ChargeContext {
  /** Exactly one of accessoryId or consumableId. */
  accessoryId?: string;
  consumableId?: string;
  /** Accessory.isMinorPart — only consulted for accessories. */
  isMinorPart?: boolean;
  contractType: ChargeContractType;
  /** SALE only; ignored otherwise. */
  withinWarranty: boolean;
}

export interface ChargeDecision {
  isChargeable: boolean;
  source: "OVERRIDE" | "DEFAULT";
  reason: string;
}

/**
 * Pure default rule — exported so callers (e.g. tests or admin UI previews)
 * can see what the system would do without a DB override.
 */
export function defaultChargeRule(ctx: ChargeContext): ChargeDecision {
  const isConsumable = !!ctx.consumableId;
  switch (ctx.contractType) {
    case "RENTAL":
      return { isChargeable: false, source: "DEFAULT", reason: "RENTAL covers all parts" };
    case "SALE":
      if (ctx.withinWarranty) {
        return { isChargeable: false, source: "DEFAULT", reason: "SALE within warranty" };
      }
      return { isChargeable: true, source: "DEFAULT", reason: "SALE after warranty" };
    case "MAINTENANCE":
      if (isConsumable) {
        return {
          isChargeable: false,
          source: "DEFAULT",
          reason: "MAINTENANCE includes consumables (PDF A.5)",
        };
      }
      if (ctx.isMinorPart) {
        return {
          isChargeable: false,
          source: "DEFAULT",
          reason: "MAINTENANCE — minor accessory",
        };
      }
      return {
        isChargeable: true,
        source: "DEFAULT",
        reason: "MAINTENANCE — major accessory",
      };
    default: {
      const _exhaustive: never = ctx.contractType;
      throw new Error(`Unhandled contractType: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Look up an override row for the exact (part, contractType, withinWarranty)
 * tuple. SALE-only tuples normalize withinWarranty as-is; for RENTAL and
 * MAINTENANCE we always query withinWarranty=false (the row layout).
 */
export async function decideCharge(ctx: ChargeContext): Promise<ChargeDecision> {
  // Exact XOR — matches DB CHECK (ChargePolicy_part_xor) and Zod superRefine.
  // Without this, "both set" would mix override lookup on one part with
  // defaultChargeRule branching on the other.
  if (!!ctx.accessoryId === !!ctx.consumableId) {
    throw new Error("decideCharge requires exactly one of accessoryId or consumableId");
  }
  const sanitizedWarranty = ctx.contractType === "SALE" ? ctx.withinWarranty : false;
  const partKey = ctx.accessoryId
    ? { accessoryId: ctx.accessoryId }
    : { consumableId: ctx.consumableId! };

  const override = await prisma.chargePolicy.findFirst({
    where: { ...partKey, contractType: ctx.contractType, withinWarranty: sanitizedWarranty },
    select: { isChargeable: true, notes: true },
  });
  if (override) {
    return {
      isChargeable: override.isChargeable,
      source: "OVERRIDE",
      reason: override.notes ?? "Admin override",
    };
  }

  return defaultChargeRule(ctx);
}
