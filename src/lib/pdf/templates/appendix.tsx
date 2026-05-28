/**
 * B2B Contract Appendix — UC-CT-05.
 *
 * Identical structure to b2b-contract but with the appendix clause
 * prepended and the document title forced to "Appendix".
 */

import { ContractDocument } from "./shared";
import { pickPdfMessages } from "@/lib/pdf/messages";
import type { PdfRenderProps } from "@/lib/pdf/types";

export function AppendixContract({ contract, customer, equipment, locale, generatedAt }: PdfRenderProps) {
  const msg = pickPdfMessages(locale);
  return (
    <ContractDocument
      title={msg.documentTitle.APPENDIX}
      contract={contract}
      customer={customer}
      equipment={equipment}
      locale={locale}
      generatedAt={generatedAt}
      clauseKeys={["appendix", "rentalTerm", "paymentTerms"] as const}
    />
  );
}
