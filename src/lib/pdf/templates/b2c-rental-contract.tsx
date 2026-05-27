/**
 * B2C Rental Contract — DOCUMENT_TEMPLATES.md #2.
 *
 * Includes rental term + 24-month mandatory clause + auto-convert §9.
 */

import { ContractDocument } from "./shared";
import { pickPdfMessages } from "@/lib/pdf/messages";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function B2cRentalContract({ contract, customer, equipment, locale, generatedAt }: PdfRenderProps) {
  const msg = pickPdfMessages(locale);
  return (
    <ContractDocument
      title={msg.documentTitle.RENTAL_B2C}
      contract={contract}
      customer={customer}
      equipment={equipment}
      locale={locale}
      generatedAt={generatedAt}
      clauseKeys={["rentalTerm", "rentalAutoConvert", "maintenance", "paymentTerms"] as const}
    />
  );
}
