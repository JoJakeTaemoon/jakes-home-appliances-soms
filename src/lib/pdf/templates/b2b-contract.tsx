/**
 * B2B Rental / Sale Contract — DOCUMENT_TEMPLATES.md #1.
 *
 * Multi-equipment table with site column. Used for both SALE and RENTAL B2B.
 * No 24-month auto-convert clause (different terms for businesses).
 */

import { ContractDocument } from "./shared";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function B2bContract({ contract, customer, equipment, langPair, generatedAt }: Readonly<PdfRenderProps>) {
  const titleKey = contract.type === "RENTAL" ? "RENTAL_B2B" : "SALE";
  const clauseKeys =
    contract.type === "RENTAL"
      ? (["rentalTerm", "maintenance", "paymentTerms"] as const)
      : (["saleOwnership", "paymentTerms"] as const);
  return (
    <ContractDocument
      titleKey={titleKey}
      contract={contract}
      customer={customer}
      equipment={equipment}
      langPair={langPair}
      generatedAt={generatedAt}
      clauseKeys={clauseKeys}
    />
  );
}
