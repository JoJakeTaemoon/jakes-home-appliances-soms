/**
 * Maintenance Contract — DOCUMENT_TEMPLATES.md #4 (maintenance variant).
 *
 * Post-rental or stand-alone maintenance contract. Recurring monthly fee +
 * periodic inspection clause; no rental term clause.
 */

import { ContractDocument } from "./shared";
import { pickPdfMessages } from "@/lib/pdf/messages";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function MaintenanceContract({ contract, customer, equipment, locale, generatedAt }: PdfRenderProps) {
  const msg = pickPdfMessages(locale);
  return (
    <ContractDocument
      title={msg.documentTitle.MAINTENANCE}
      contract={contract}
      customer={customer}
      equipment={equipment}
      locale={locale}
      generatedAt={generatedAt}
      clauseKeys={["maintenance", "paymentTerms"] as const}
    />
  );
}
