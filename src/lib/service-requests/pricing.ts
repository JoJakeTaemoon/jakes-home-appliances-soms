/**
 * Service Request pricing rules (Phase 5 — UC-SR-01 step 5).
 *
 * Per CLAUDE.md C.6 client answer: some SR types can be free in certain
 * contexts. This module encodes the default heuristic; downstream callers
 * (office approval modal) can override `isPaid` if the manager disagrees.
 *
 * Heuristic summary:
 *   INSPECTION       free if equipment under active maintenance contract OR
 *                    within first 90 days of install; else paid.
 *   REPAIR           paid; free if under warranty (Phase 5 = first 6 months
 *                    of install date).
 *   PART_REPLACEMENT free if filter replacement under filter policy schedule
 *                    (rental contract assumed to cover scheduled filters);
 *                    else paid.
 *   RELOCATION       paid; free for first relocation within first 90 days
 *                    of install.
 *   OTHER            paid (manager review).
 *
 * Pure function — returns `{ isPaid, reason }` so the UI can show *why* and
 * the audit log records the decision input. No DB calls — caller assembles
 * the inputs.
 *
 * TODO(Phase 6+): real pricing rules might come from the client (A.5 filter
 * compatibility data still pending). For now these heuristics keep the flow
 * functional and explicit.
 */

export type ServiceRequestTypeLite =
  | "INSPECTION"
  | "REPAIR"
  | "PART_REPLACEMENT"
  | "RELOCATION"
  | "OTHER";

/**
 * Minimal slice of the customer + equipment + active contracts needed to
 * decide `isPaid`. All fields are nullable so call sites can pass `null` when
 * an SR has no equipment (e.g. customer asking about general service).
 */
export interface PricingInputs {
  type: ServiceRequestTypeLite;
  customerType?: "B2C" | "B2B" | null;
  equipment?: {
    id: string;
    installedAt: Date | string | null;
    /**
     * Has the customer had any prior RELOCATION SR on this equipment? Used
     * for "first relocation within 90 days" rule.
     */
    hadPriorRelocation?: boolean;
  } | null;
  /**
   * Active contracts on the customer or equipment (any state in
   * [`ACTIVE`, `AMENDED`]). The pricing helper only checks `type` — the
   * caller is responsible for filtering by state and equipment binding.
   */
  contracts?: {
    type: "SALE" | "RENTAL" | "MAINTENANCE";
  }[];
  /** Override clock for tests. Default `new Date()`. */
  now?: Date;
}

export interface PricingDecision {
  isPaid: boolean;
  /**
   * Stable string used in the UI tag, audit log, and SMS template variable.
   * One of:
   *   - "covered-by-maintenance"
   *   - "within-install-window"
   *   - "under-warranty"
   *   - "scheduled-filter"
   *   - "first-relocation"
   *   - "paid-default"
   *   - "no-equipment"
   */
  reason:
    | "covered-by-maintenance"
    | "within-install-window"
    | "under-warranty"
    | "scheduled-filter"
    | "first-relocation"
    | "paid-default"
    | "no-equipment";
}

const DAY = 24 * 60 * 60 * 1000;
const INSTALL_GRACE_DAYS = 90;
const WARRANTY_DAYS = 180; // first 6 months
const RELOCATION_GRACE_DAYS = 90;

function daysSince(installedAt: Date | string | null | undefined, now: Date): number | null {
  if (!installedAt) return null;
  const d = installedAt instanceof Date ? installedAt : new Date(installedAt);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / DAY);
}

function hasActiveContract(
  contracts: PricingInputs["contracts"],
  kind: "RENTAL" | "MAINTENANCE",
): boolean {
  return Boolean(contracts?.some((c) => c.type === kind));
}

export function determineIsPaid(input: PricingInputs): PricingDecision {
  const now = input.now ?? new Date();
  const installAgeDays = daysSince(input.equipment?.installedAt, now);
  const underMaintenance = hasActiveContract(input.contracts, "MAINTENANCE");
  const underRental = hasActiveContract(input.contracts, "RENTAL");

  switch (input.type) {
    case "INSPECTION": {
      if (underMaintenance || underRental) {
        return { isPaid: false, reason: "covered-by-maintenance" };
      }
      if (installAgeDays !== null && installAgeDays <= INSTALL_GRACE_DAYS) {
        return { isPaid: false, reason: "within-install-window" };
      }
      return { isPaid: true, reason: "paid-default" };
    }

    case "REPAIR": {
      if (installAgeDays !== null && installAgeDays <= WARRANTY_DAYS) {
        return { isPaid: false, reason: "under-warranty" };
      }
      // A maintenance contract covers periodic but not arbitrary repair work,
      // unless the equipment is rental (where Seoul Aqua still owns the unit).
      if (underRental) {
        return { isPaid: false, reason: "covered-by-maintenance" };
      }
      return { isPaid: true, reason: "paid-default" };
    }

    case "PART_REPLACEMENT": {
      // Rental: all scheduled filter swaps are free. Maintenance contract:
      // also free for scheduled filters. Sale-only: customer pays.
      if (underRental || underMaintenance) {
        return { isPaid: false, reason: "scheduled-filter" };
      }
      return { isPaid: true, reason: "paid-default" };
    }

    case "RELOCATION": {
      if (!input.equipment?.hadPriorRelocation) {
        if (
          installAgeDays !== null &&
          installAgeDays <= RELOCATION_GRACE_DAYS
        ) {
          return { isPaid: false, reason: "first-relocation" };
        }
      }
      return { isPaid: true, reason: "paid-default" };
    }

    case "OTHER":
    default:
      return { isPaid: true, reason: "paid-default" };
  }
}

/**
 * Map an SR type → matching Visit type for auto-creation on approval.
 * INSPECTION → PERIODIC_INSPECTION (this matches Phase 4's enum).
 */
export function srTypeToVisitType(
  type: ServiceRequestTypeLite,
): "PERIODIC_INSPECTION" | "REPAIR" | "FILTER_REPLACEMENT" | "RELOCATION" | "OTHER" {
  switch (type) {
    case "INSPECTION":
      return "PERIODIC_INSPECTION";
    case "REPAIR":
      return "REPAIR";
    case "PART_REPLACEMENT":
      return "FILTER_REPLACEMENT";
    case "RELOCATION":
      return "RELOCATION";
    case "OTHER":
    default:
      return "OTHER";
  }
}
