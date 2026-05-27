/**
 * B2C Sale Contract / Delivery Receipt — DOCUMENT_TEMPLATES.md #4 (collapsed sale receipt).
 *
 * One-time purchase. No rental clause; ownership transfers immediately.
 */

import { ContractDocument } from "./shared";
import { pickPdfMessages } from "@/lib/pdf/messages";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function B2cSaleContract({ contract, customer, equipment, locale, generatedAt }: PdfRenderProps) {
  const msg = pickPdfMessages(locale);
  return (
    <ContractDocument
      title={msg.documentTitle.SALE}
      contract={contract}
      customer={customer}
      equipment={equipment}
      locale={locale}
      generatedAt={generatedAt}
      clauseKeys={["saleOwnership", "paymentTerms"] as const}
    />
  );
}
