/**
 * B2B Contract Appendix — UC-CT-05.
 *
 * Identical structure to b2b-contract but with the appendix clause
 * prepended and the document title forced to "Appendix".
 */

import { ContractDocument } from "./shared";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function AppendixContract({ contract, customer, equipment, langPair, generatedAt, company, hqPhone }: Readonly<PdfRenderProps>) {
  return (
    <ContractDocument
      titleKey="APPENDIX"
      contract={contract}
      customer={customer}
      equipment={equipment}
      langPair={langPair}
      generatedAt={generatedAt}
      company={company}
      hqPhone={hqPhone}
      clauseKeys={["appendix", "rentalTerm", "paymentTerms"] as const}
    />
  );
}
