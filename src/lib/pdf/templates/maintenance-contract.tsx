/**
 * Maintenance Contract — DOCUMENT_TEMPLATES.md #4 (maintenance variant).
 *
 * Post-rental or stand-alone maintenance contract. Recurring monthly fee +
 * periodic inspection clause; no rental term clause.
 */

import { ContractDocument } from "./shared";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function MaintenanceContract({ contract, customer, equipment, langPair, generatedAt, company, hqPhone }: Readonly<PdfRenderProps>) {
  return (
    <ContractDocument
      titleKey="MAINTENANCE"
      contract={contract}
      customer={customer}
      equipment={equipment}
      langPair={langPair}
      generatedAt={generatedAt}
      company={company}
      hqPhone={hqPhone}
      clauseKeys={["maintenance", "paymentTerms"] as const}
    />
  );
}
