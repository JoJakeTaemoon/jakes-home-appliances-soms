/**
 * Viettel SInvoice integration stub.
 *
 * Phase 6 ships manual-upload only — the office uploads a PDF generated in
 * Viettel's e-invoice portal and we attach it to the Payment row. Phase 8+
 * will swap this stub for a real integration:
 *
 *   1. Call SInvoice REST /api/InvoiceWS/createInvoice with the line items,
 *      VAT breakdown, customer tax code.
 *   2. Receive a signed XML + PDF; persist both under `uploads/tax-invoices/`.
 *   3. Save `invoiceNumber` + `invoiceProviderRef` (Viettel's invoice GUID).
 *
 * Until then this throws so callers see a loud failure mode rather than a
 * silent no-op.
 */

import type { Payment } from "@/generated/prisma/client";

export class SInvoiceNotImplementedError extends Error {
  readonly code = "SINVOICE_NOT_IMPLEMENTED";
  constructor() {
    super("Viettel SInvoice integration is deferred to Phase 8+");
    this.name = "SInvoiceNotImplementedError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function issueSInvoice(_payment: Payment): Promise<never> {
  throw new SInvoiceNotImplementedError();
}
