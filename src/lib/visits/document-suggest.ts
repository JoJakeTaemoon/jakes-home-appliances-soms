/**
 * Visit → Document kind suggestion (Track 3 of the visit-mgmt deep dive).
 *
 * Maps a visit's (VisitType, Customer.type, Contract.type) tuple to the
 * single most-relevant visit document. **Suggestion only** — D3 decided
 * issuance is manual (office STAFF+ clicks "발급"). The suggestion
 * pre-selects the kind in the visit-detail card so the common case is a
 * one-click flow.
 *
 *   INSTALLATION + B2C + RENTAL  → DELIVERY_RECEIPT
 *   INSTALLATION + B2C + SALE    → SALE_RECEIPT_B2C
 *   INSTALLATION + B2B + *       → DELIVERY_SLIP_B2B
 *   PERIODIC_INSPECTION + B2C    → PERIODIC_CHECK_B2C
 *   PERIODIC_INSPECTION + B2B    → PERIODIC_CHECK_B2B
 *   REPAIR / FILTER_REPLACEMENT / RELOCATION / PAYMENT_COLLECTION / OTHER
 *                                → WORK_CONFIRMATION
 *
 * Caller decides whether to pull the contract type from the customer's
 * latest active contract or from the visit's serviceRequestId chain; this
 * module keeps the policy pure so it stays unit-testable.
 */

export type VisitTypeForSuggest =
  | "INSTALLATION"
  | "PERIODIC_INSPECTION"
  | "REPAIR"
  | "FILTER_REPLACEMENT"
  | "RELOCATION"
  | "PAYMENT_COLLECTION"
  | "OTHER";

export type CustomerTypeForSuggest = "B2C" | "B2B";

export type ContractTypeForSuggest = "RENTAL" | "SALE" | "MAINTENANCE";

export type VisitDocumentKind =
  | "DELIVERY_RECEIPT"
  | "SALE_RECEIPT_B2C"
  | "DELIVERY_SLIP_B2B"
  | "PERIODIC_CHECK_B2C"
  | "PERIODIC_CHECK_B2B"
  | "WORK_CONFIRMATION";

/** The full set of kinds that callers can manually pick from. */
export const VISIT_DOCUMENT_KINDS = [
  "DELIVERY_RECEIPT",
  "SALE_RECEIPT_B2C",
  "DELIVERY_SLIP_B2B",
  "PERIODIC_CHECK_B2C",
  "PERIODIC_CHECK_B2B",
  "WORK_CONFIRMATION",
] as const satisfies ReadonlyArray<VisitDocumentKind>;

export function isVisitDocumentKind(s: string): s is VisitDocumentKind {
  return (VISIT_DOCUMENT_KINDS as readonly string[]).includes(s);
}

export interface SuggestInput {
  visitType: VisitTypeForSuggest;
  customerType: CustomerTypeForSuggest;
  /** Latest active contract type for the customer, when known. */
  contractType: ContractTypeForSuggest | null;
}

export function suggestVisitDocumentKind(
  input: SuggestInput,
): VisitDocumentKind {
  const { visitType, customerType, contractType } = input;

  if (visitType === "INSTALLATION") {
    if (customerType === "B2B") return "DELIVERY_SLIP_B2B";
    return contractType === "SALE" ? "SALE_RECEIPT_B2C" : "DELIVERY_RECEIPT";
  }

  if (visitType === "PERIODIC_INSPECTION") {
    return customerType === "B2B" ? "PERIODIC_CHECK_B2B" : "PERIODIC_CHECK_B2C";
  }

  // REPAIR / FILTER_REPLACEMENT / RELOCATION / PAYMENT_COLLECTION / OTHER
  return "WORK_CONFIRMATION";
}

/**
 * Which kinds are *available* for an office user to pick manually. For
 * now we expose all 6 — the SUGGESTED visit gate (document-policy.ts)
 * handles whether the visit is allowed to issue *anything* at all. The
 * server still validates the chosen kind against payload requirements
 * (e.g. PERIODIC_CHECK_B2C needs a B2C customer + equipment).
 */
export function availableVisitDocumentKinds(): ReadonlyArray<VisitDocumentKind> {
  return VISIT_DOCUMENT_KINDS;
}
