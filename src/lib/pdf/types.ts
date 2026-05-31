/**
 * Strongly-typed props for the PDF templates. Keeping the shapes here lets
 * both the render service and the React components stay in sync.
 */

export type PdfLocale = "ko" | "vi" | "en";

/**
 * Every generated document is bilingual: a fixed Vietnamese primary line on top
 * with a secondary line beneath it. The secondary language is the only choice —
 * Korean by default, English on request.
 */
export type PdfLangPair = "vi-ko" | "vi-en";

export interface PdfLangSplit {
  primary: PdfLocale;
  secondary: PdfLocale;
}

export function splitLangPair(pair: PdfLangPair): PdfLangSplit {
  return pair === "vi-en"
    ? { primary: "vi", secondary: "en" }
    : { primary: "vi", secondary: "ko" };
}

/** Map a single preferred locale to the bilingual pair we render it as. */
export function langPairForLocale(locale: string | null | undefined): PdfLangPair {
  return locale === "en" ? "vi-en" : "vi-ko";
}

/**
 * Resolve the bilingual pair based on the contract party's preferred language.
 *
 * Rule (Phase 6 update):
 *   - VI primary always.
 *   - Secondary follows the contract party's language.
 *   - If the party is already VI (so KO/EN would be empty), fall back to EN
 *     as a courtesy block.
 */
export function langPairForContractParty(
  partyLanguage: string | null | undefined,
): PdfLangPair {
  if (partyLanguage === "ko") return "vi-ko";
  if (partyLanguage === "en" || partyLanguage === "vi") return "vi-en";
  return "vi-en";
}

export interface PdfCustomerSummary {
  id: string;
  code: string;
  name: string;
  type: "B2C" | "B2B";
  shortcode: string | null;
  taxCode: string | null;
  /** B2B: legal representative. */
  representativeName: string | null;
  /** B2C: DOMESTIC / FOREIGN (null for B2B). */
  residency: "DOMESTIC" | "FOREIGN" | null;
  /** B2C DOMESTIC: Vietnamese CCCD. */
  nationalId: string | null;
  /** B2C FOREIGN: passport number. */
  passportNumber: string | null;
  /** B2C FOREIGN: nationality. */
  nationality: string | null;
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

/**
 * Issuing-company info inlined into every contract PDF. Mirrors
 * `CompanyTaxInfo` from `@/lib/settings` so PDF code stays self-contained
 * (no settings imports in template files).
 */
export interface PdfCompanyInfo {
  legalName: string;
  address: string;
  representativeName: string;
  taxCode: string;
}

export interface PdfRenderProps {
  langPair: PdfLangPair;
  contract: PdfContractView;
  customer: PdfCustomerSummary;
  equipment: PdfEquipmentLine[];
  /** Generated-at timestamp used in the page footer. */
  generatedAt: Date;
  /** Issuing-company legal block, from `SystemSetting company.taxInfo`. */
  company: PdfCompanyInfo;
  /** HQ phone, from `SystemSetting company.hqPhone`. */
  hqPhone: string;
}
