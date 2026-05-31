/**
 * B2C Sale Contract / Delivery Receipt — DOCUMENT_TEMPLATES.md #4 (collapsed sale receipt).
 *
 * One-time purchase. No rental clause; ownership transfers immediately.
 */

import { ContractDocument } from "./shared";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function B2cSaleContract({ contract, customer, equipment, langPair, generatedAt, company, hqPhone }: Readonly<PdfRenderProps>) {
  return (
    <ContractDocument
      titleKey="SALE"
      contract={contract}
      customer={customer}
      equipment={equipment}
      langPair={langPair}
      generatedAt={generatedAt}
      company={company}
      hqPhone={hqPhone}
      clauseKeys={["saleOwnership", "paymentTerms"] as const}
    />
  );
}
