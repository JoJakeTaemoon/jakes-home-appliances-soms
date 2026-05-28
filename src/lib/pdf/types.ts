/**
 * Strongly-typed props for the PDF templates. Keeping the shapes here lets
 * both the render service and the React components stay in sync.
 */

export type PdfLocale = "ko" | "vi" | "en";

export interface PdfCustomerSummary {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  shortcode: string | null;
  taxCode: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  contractParty: {
    name: string;
    title: string | null;
    phone: string;
    email: string | null;
    language: PdfLocale;
  } | null;
}

export interface PdfEquipmentLine {
  equipmentId: string;
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
  siteName: string | null;
  unitPrice: number | null;
  quantity: number;
  notes: string | null;
}

export interface PdfContractView {
  id: string;
  contractNumber: string;
  type: "SALE" | "RENTAL" | "MAINTENANCE";
  state: string;
  startDate: Date | null;
  endDate: Date | null;
  termMonths: number | null;
  monthlyMaintenanceFee: number | null;
  totalContractValue: number | null;
  signedByCustomerAt: Date | null;
  signedByCompanyAt: Date | null;
  activatedAt: Date | null;
  notes: string | null;
  parentContractNumber: string | null;
  amendmentRevision: number;
  amendmentReason: string | null;
}

export interface PdfRenderProps {
  locale: PdfLocale;
  contract: PdfContractView;
  customer: PdfCustomerSummary;
  equipment: PdfEquipmentLine[];
  /** Generated-at timestamp used in the page footer. */
  generatedAt: Date;
}
