/**
 * B2C Rental Contract — DOCUMENT_TEMPLATES.md #2.
 *
 * Includes rental term + 24-month mandatory clause + auto-convert §9.
 */

import { ContractDocument } from "./shared";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function B2cRentalContract({ contract, customer, equipment, langPair, generatedAt }: Readonly<PdfRenderProps>) {
  return (
    <ContractDocument
      titleKey="RENTAL_B2C"
      contract={contract}
      customer={customer}
      equipment={equipment}
      langPair={langPair}
      generatedAt={generatedAt}
      clauseKeys={["rentalTerm", "rentalAutoConvert", "maintenance", "paymentTerms"] as const}
    />
  );
}
