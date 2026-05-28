/**
 * B2B Rental / Sale Contract — DOCUMENT_TEMPLATES.md #1.
 *
 * Multi-equipment table with site column. Used for both SALE and RENTAL B2B.
 * No 24-month auto-convert clause (different terms for businesses).
 */

import { ContractDocument } from "./shared";
import { pickPdfMessages } from "@/lib/pdf/messages";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function B2bContract({ contract, customer, equipment, locale, generatedAt }: PdfRenderProps) {
  const msg = pickPdfMessages(locale);
  const title =
    contract.type === "RENTAL"
      ? msg.documentTitle.RENTAL_B2B
      : msg.documentTitle.SALE;
  const clauseKeys =
    contract.type === "RENTAL"
      ? (["rentalTerm", "maintenance", "paymentTerms"] as const)
      : (["saleOwnership", "paymentTerms"] as const);
  return (
    <ContractDocument
      title={title}
      contract={contract}
      customer={customer}
      equipment={equipment}
      locale={locale}
      generatedAt={generatedAt}
      clauseKeys={clauseKeys}
    />
  );
}
