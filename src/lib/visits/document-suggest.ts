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
 *   CONSUMABLE_DELIVERY + B2C    → SALE_RECEIPT_B2C   (purchase = sale)
 *   CONSUMABLE_DELIVERY + B2B    → DELIVERY_SLIP_B2B  (goods handoff)
 *   REPAIR / FILTER_REPLACEMENT / RELOCATION / PAYMENT_COLLECTION /
 *   RETRIEVAL / OTHER            → WORK_CONFIRMATION
 *
 * Caller decides whether to pull the contract type from the customer's
 * latest active contract or from the visit's serviceRequestId chain; this
 * module keeps the policy pure so it stays unit-testable.
 *
 * Multi-purpose trips (e.g. PERIODIC_INSPECTION + CONSUMABLE_DELIVERY as
 * `additionalTypes`) call `suggestVisitDocumentKindList` instead, which
 * returns the deduped union of docs across every type on the visit.
 */

export type VisitTypeForSuggest =
  | "INSTALLATION"
  | "PERIODIC_INSPECTION"
  | "REPAIR"
  | "FILTER_REPLACEMENT"
  | "RELOCATION"
  | "PAYMENT_COLLECTION"
  | "RETRIEVAL"
  | "CONSUMABLE_DELIVERY"
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

  if (visitType === "CONSUMABLE_DELIVERY") {
    // Purchase — B2C treats it as an outright sale (판매영수증), B2B as
    // goods handoff on the Vietnamese Mẫu số 02-VT delivery slip.
    return customerType === "B2B" ? "DELIVERY_SLIP_B2B" : "SALE_RECEIPT_B2C";
  }

  // REPAIR / FILTER_REPLACEMENT / RELOCATION / PAYMENT_COLLECTION /
  // RETRIEVAL / OTHER
  return "WORK_CONFIRMATION";
}

/**
 * Union of docs for every type the visit covers — primary `type` plus
 * every entry in `additionalTypes`. Deduped in first-seen order (primary
 * type wins). Empty `additionalTypes` collapses to the single-doc path.
 */
export function suggestVisitDocumentKindList(input: {
  visitType: VisitTypeForSuggest;
  additionalTypes: VisitTypeForSuggest[];
  customerType: CustomerTypeForSuggest;
  contractType: ContractTypeForSuggest | null;
}): VisitDocumentKind[] {
  const seen = new Set<VisitDocumentKind>();
  const out: VisitDocumentKind[] = [];
  const push = (k: VisitDocumentKind) => {
    if (seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  push(
    suggestVisitDocumentKind({
      visitType: input.visitType,
      customerType: input.customerType,
      contractType: input.contractType,
    }),
  );
  for (const t of input.additionalTypes) {
    push(
      suggestVisitDocumentKind({
        visitType: t,
        customerType: input.customerType,
        contractType: input.contractType,
      }),
    );
  }
  return out;
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
