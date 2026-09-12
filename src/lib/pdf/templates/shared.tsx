/**
 * Shared layout primitives + StyleSheet used by all contract templates.
 *
 * Every document is **bilingual (병기)**: a Vietnamese primary line on top with
 * a Korean (default) or English secondary line beneath it, in a smaller muted
 * style. Labels, section titles, the document title, clauses and signature
 * captions are all stacked this way; data values (names, dates, amounts) are
 * language-neutral and rendered once. Dates use the Vietnamese (primary)
 * DD/MM/YYYY format.
 *
 * Each template (B2C sale / B2C rental / B2B / maintenance / appendix)
 * composes these primitives, passing a `langPair` + a `titleKey`.
 */

import path from "node:path";
import { Document, Page, Image, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

import type {
  PdfCompanyInfo,
  PdfContractView,
  PdfCustomerSummary,
  PdfEquipmentLine,
  PdfLangPair,
} from "@/lib/pdf/types";
import { pickPdfPair, interpolate, type PdfMessages } from "@/lib/pdf/messages";
import { PDF_DEFAULT_FAMILY, PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

// Watermark logo is resolved at module load — `process.cwd()` is the project
// root in both Next.js server runtime and the standalone tsx render script.
const WATERMARK_LOGO_PATH = path.join(process.cwd(), "public", "logo", "jakes-home-appliances-logo.jpg");

export const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9.5,
    fontFamily: PDF_DEFAULT_FAMILY,
    color: "#111111",
  },
  koText: { fontFamily: PDF_FONT_FAMILY.ko },
  viText: { fontFamily: PDF_FONT_FAMILY.vi },
  enText: { fontFamily: PDF_FONT_FAMILY.en },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#0C6BA8", // brand blue
    paddingBottom: 8,
    marginBottom: 10,
  },
  brandTitle: { fontSize: 14, fontWeight: "bold", color: "#0C6BA8" },
  brandLegal: { fontSize: 8, color: "#666666" },
  // Contract number rendered as one line: `Số hợp đồng / 계약 번호: HD-…`.
  contractNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    columnGap: 4,
  },
  contractNumberLabelPrimary: { fontSize: 9, color: "#666666" },
  contractNumberLabelSecondary: { fontSize: 9, color: "#999999" },
  contractNumberValue: { fontSize: 11, fontWeight: "bold", color: "#111111" },
  docTitle: { fontSize: 14, fontWeight: "bold", marginTop: 4, textAlign: "center" },
  docTitleSecondary: {
    fontSize: 10,
    fontWeight: "normal",
    color: "#555555",
    marginBottom: 8,
    textAlign: "center",
  },
  // Two-column party layout — Jake's Home Appliances left, customer right; both fit on
  // page 1 above the equipment + clauses.
  partyRow: { flexDirection: "row", columnGap: 8, marginBottom: 6 },
  partyCol: { flex: 1 },
  partyTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0C6BA8",
    marginBottom: 4,
  },
  // Big, prominent name (customer or company representative) printed
  // immediately under the "Party A" / "Party B" header.
  partyName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#111111",
    marginBottom: 6,
  },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 90, color: "#666666", fontSize: 8.5 },
  metaLabelSecondary: { fontSize: 7.5, color: "#999999" },
  metaValue: { flex: 1, color: "#111111", fontSize: 9 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0C6BA8",
    marginTop: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 2,
  },
  sectionTitleSecondary: { fontSize: 8.5, fontWeight: "normal", color: "#6AA4C8" },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cccccc",
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  tableCell: { flex: 1, paddingRight: 4 },
  tableCellNum: { width: 30, textAlign: "right", paddingRight: 4 },
  tableCellPrice: { width: 80, textAlign: "right", paddingRight: 4 },
  tableCellTotal: { width: 90, textAlign: "right", paddingRight: 4 },
  cellSecondary: { fontSize: 7.5, fontWeight: "normal", color: "#999999" },
  clause: { marginBottom: 2, lineHeight: 1.4 },
  clauseSecondary: { marginBottom: 6, lineHeight: 1.4, color: "#555555" },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    // 3x prior gap — leaves room between the clause-block tail and the
    // horizontal signature lines, per layout spec.
    marginTop: 96,
  },
  signatureBox: {
    width: "46%",
    alignItems: "center",
    // Stamp + ink + role labels + signer name all fit comfortably.
    minHeight: 150,
  },
  // "Party A" / "Party B" header at the very top of each box.
  signaturePartyTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0C6BA8",
    textAlign: "center",
    marginBottom: 4,
  },
  // Empty room reserved for ink + company stamp. Horizontal line is drawn on
  // the bottom edge so role labels and name sit beneath it.
  signatureSlot: {
    flex: 1,
    alignSelf: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    marginBottom: 4,
  },
  signatureLabel: { fontSize: 9, color: "#111111", textAlign: "center", marginTop: 2 },
  signatureLabelSecondary: { fontSize: 8, color: "#777777", textAlign: "center" },
  signatureName: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#111111",
    textAlign: "center",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#888888",
  },
  // Centered watermark logo, half opacity, lives behind every page's content.
  watermark: {
    position: "absolute",
    top: "30%",
    left: "10%",
    right: "10%",
    height: "40%",
    opacity: 0.08,
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkImage: { width: 320, height: 320, objectFit: "contain" },
});

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;
/**
 * Pick a font family per string content. Latin / Vietnamese text gets the
 * default Be Vietnam Pro; any string containing Hangul switches to Noto Sans
 * KR. Used everywhere instead of a React Context — Next.js 16's RSC analyzer
 * blocks top-level `createContext` calls in any module reachable from App
 * Router entrypoints, and the @react-pdf templates need to be reachable from
 * the `/api/contracts` Route Handler chain. Content-based selection works
 * because each call already knows the text it is rendering.
 */
function autoFontStyle(s: string | null | undefined): Style {
  return s && HANGUL_RE.test(s) ? styles.koText : styles.viText;
}

/**
 * Single-line secondary text. The font family is chosen from the content
 * itself (Hangul → NotoSansKR, otherwise BeVietnamPro), so KO secondary
 * content keeps its glyphs without needing a locale prop threaded all the
 * way down.
 */
function SecondaryText({
  style,
  children,
}: Readonly<{ style?: Style | Style[]; children: string }>) {
  const composed = ([] as Style[]).concat(style ?? [], autoFontStyle(children));
  return <Text style={composed}>{children}</Text>;
}

/**
 * Bilingual stacked text: primary on top, secondary beneath it in `subStyle`.
 * Each half picks its font family from its own content via `autoFontStyle`.
 */
export function Bi({
  primary,
  secondary,
  style,
  subStyle,
}: Readonly<{
  primary: string;
  secondary: string;
  style?: Style | Style[];
  subStyle?: Style | Style[];
}>) {
  const composedStyle = ([] as Style[]).concat(style ?? [], autoFontStyle(primary));
  const composedSub = ([] as Style[]).concat(subStyle ?? [], autoFontStyle(secondary));
  return (
    <Text style={composedStyle}>
      {primary}
      {"\n"}
      <Text style={composedSub}>{secondary}</Text>
    </Text>
  );
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  // Primary language is always Vietnamese → DD/MM/YYYY.
  return `${day}/${m}/${y}`;
}

function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded).toString();
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withDots} VND`;
}

interface PairProps {
  primary: PdfMessages;
  secondary: PdfMessages;
}

interface HeaderProps extends PairProps {
  contract: PdfContractView;
  titleKey: keyof PdfMessages["documentTitle"];
  customer: PdfCustomerSummary;
}

export function PdfHeader({ contract, titleKey, primary, secondary }: Readonly<HeaderProps>) {
  return (
    <>
      <View style={styles.brandHeader}>
        <View>
          <Text style={styles.brandTitle}>JAKE'S HOME APPLIANCES</Text>
          <Text style={styles.brandLegal}>{primary.labels.seoulAquaLegalName}</Text>
        </View>
        <View style={styles.contractNumberRow}>
          <Text style={styles.contractNumberLabelPrimary}>
            {primary.labels.contractNumber}
          </Text>
          <SecondaryText style={styles.contractNumberLabelSecondary}>
            {`/ ${secondary.labels.contractNumber}:`}
          </SecondaryText>
          <Text style={styles.contractNumberValue}>{contract.contractNumber}</Text>
        </View>
      </View>
      <Text style={styles.docTitle}>{primary.documentTitle[titleKey]}</Text>
      <SecondaryText style={styles.docTitleSecondary}>{secondary.documentTitle[titleKey]}</SecondaryText>
    </>
  );
}

interface PartiesBlockProps extends PairProps {
  customer: PdfCustomerSummary;
  company: PdfCompanyInfo;
  hqPhone: string;
}

/**
 * Side-by-side parties block. **Party A (left) = customer**,
 * **Party B (right) = Jake's Home Appliances**. The legal contract-party name (customer
 * name, or company-representative name) is printed prominently right under
 * the Party header; supporting fields follow in label/value rows.
 *
 * B2B customer only shows the contract-party (name/phone/email) — internal
 * Ops or Accounting contacts are intentionally excluded per the contract
 * layout spec.
 */
export function PdfPartiesBlock({ customer, company, hqPhone, primary, secondary }: Readonly<PartiesBlockProps>) {
  const customerAddress =
    [customer.address, customer.district, customer.city].filter(Boolean).join(", ") || "—";
  return (
    <View style={styles.partyRow}>
      {/* Party A — Customer (left) */}
      <View style={[styles.card, styles.partyCol]}>
        <Text style={styles.partyTitle}>Party A</Text>
        <Text style={[styles.partyName, autoFontStyle(customer.name)]}>
          {customer.name} ({customer.code})
        </Text>
        {customer.type === "B2B" && customer.taxCode && (
          <View style={styles.metaRow}>
            <Bi primary={primary.labels.taxCode} secondary={secondary.labels.taxCode} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
            <Text style={styles.metaValue}>{customer.taxCode}</Text>
          </View>
        )}
        {customer.type === "B2B" && customer.contractParty?.name && (
          <View style={styles.metaRow}>
            <Bi primary={primary.labels.customerRepresentative} secondary={secondary.labels.customerRepresentative} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
            <Text style={[styles.metaValue, autoFontStyle(customer.contractParty.name)]}>{customer.contractParty.name}</Text>
          </View>
        )}
        {customer.type === "B2C" && customer.residency === "DOMESTIC" && customer.nationalId && (
          <View style={styles.metaRow}>
            <Bi primary={primary.labels.customerNationalId} secondary={secondary.labels.customerNationalId} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
            <Text style={styles.metaValue}>{customer.nationalId}</Text>
          </View>
        )}
        {customer.type === "B2C" && customer.residency === "FOREIGN" && (
          <>
            {customer.nationality && (
              <View style={styles.metaRow}>
                <Bi primary={primary.labels.customerNationality} secondary={secondary.labels.customerNationality} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
                <Text style={[styles.metaValue, autoFontStyle(customer.nationality)]}>{customer.nationality}</Text>
              </View>
            )}
            {customer.passportNumber && (
              <View style={styles.metaRow}>
                <Bi primary={primary.labels.customerPassport} secondary={secondary.labels.customerPassport} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
                <Text style={styles.metaValue}>{customer.passportNumber}</Text>
              </View>
            )}
          </>
        )}
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.address} secondary={secondary.labels.address} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={[styles.metaValue, autoFontStyle(customerAddress)]}>{customerAddress}</Text>
        </View>
        {customer.contractParty && (
          <>
            <View style={styles.metaRow}>
              <Bi primary={primary.labels.contactName} secondary={secondary.labels.contactName} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
              <Text style={[styles.metaValue, autoFontStyle(customer.contractParty.name)]}>
                {customer.contractParty.name}
                {customer.contractParty.title ? ` (${customer.contractParty.title})` : ""}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Bi primary={primary.labels.contactPhone} secondary={secondary.labels.contactPhone} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
              <Text style={styles.metaValue}>{customer.contractParty.phone}</Text>
            </View>
            {customer.contractParty.email && (
              <View style={styles.metaRow}>
                <Bi primary={primary.labels.contactEmail} secondary={secondary.labels.contactEmail} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
                <Text style={styles.metaValue}>{customer.contractParty.email}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Party B — Jake's Home Appliances (right) */}
      <View style={[styles.card, styles.partyCol]}>
        <Text style={styles.partyTitle}>Party B</Text>
        <Text style={[styles.partyName, autoFontStyle(company.legalName)]}>
          {company.legalName}
        </Text>
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.companyRepresentative} secondary={secondary.labels.companyRepresentative} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={[styles.metaValue, autoFontStyle(company.representativeName)]}>{company.representativeName}</Text>
        </View>
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.companyAddress} secondary={secondary.labels.companyAddress} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{company.address}</Text>
        </View>
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.companyTaxCode} secondary={secondary.labels.companyTaxCode} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{company.taxCode}</Text>
        </View>
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.companyPhone} secondary={secondary.labels.companyPhone} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{hqPhone}</Text>
        </View>
      </View>
    </View>
  );
}

interface MetaProps extends PairProps {
  contract: PdfContractView;
}

export function PdfMeta({ contract, primary, secondary }: Readonly<MetaProps>) {
  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.contractType} secondary={secondary.labels.contractType} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Bi
          primary={primary.labels.type[contract.type]}
          secondary={secondary.labels.type[contract.type]}
          style={styles.metaValue}
          subStyle={styles.metaLabelSecondary}
        />
      </View>
      {contract.startDate && (
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.startDate} secondary={secondary.labels.startDate} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{formatDate(contract.startDate)}</Text>
        </View>
      )}
      {contract.endDate && (
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.endDate} secondary={secondary.labels.endDate} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{formatDate(contract.endDate)}</Text>
        </View>
      )}
      {contract.termMonths !== null && contract.termMonths !== undefined && (
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.termMonths} secondary={secondary.labels.termMonths} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{contract.termMonths}</Text>
        </View>
      )}
      {contract.monthlyMaintenanceFee !== null && (
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.monthlyFee} secondary={secondary.labels.monthlyFee} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{formatVnd(contract.monthlyMaintenanceFee)}</Text>
        </View>
      )}
      {contract.totalContractValue !== null && (
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.totalValue} secondary={secondary.labels.totalValue} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{formatVnd(contract.totalContractValue)}</Text>
        </View>
      )}
      {contract.amendmentRevision > 0 && contract.parentContractNumber && (
        <>
          <View style={styles.metaRow}>
            <Bi primary={primary.labels.parentContractNumber} secondary={secondary.labels.parentContractNumber} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
            <Text style={styles.metaValue}>{contract.parentContractNumber}</Text>
          </View>
          <View style={styles.metaRow}>
            <Bi primary={primary.labels.revision} secondary={secondary.labels.revision} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
            <Text style={styles.metaValue}>A{contract.amendmentRevision}</Text>
          </View>
        </>
      )}
    </View>
  );
}

interface EquipmentTableProps extends PairProps {
  equipment: PdfEquipmentLine[];
  showSite: boolean;
}

export function PdfEquipmentTable({ equipment, showSite, primary, secondary }: Readonly<EquipmentTableProps>) {
  let grandTotal = 0;
  for (const e of equipment) {
    if (e.unitPrice !== null) grandTotal += Number(e.unitPrice) * (e.quantity ?? 1);
  }
  return (
    <View>
      <View style={{ marginTop: 12, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "#e5e5e5", paddingBottom: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0C6BA8" }}>{primary.labels.equipmentLines}</Text>
        <SecondaryText style={styles.sectionTitleSecondary}>{secondary.labels.equipmentLines}</SecondaryText>
      </View>
      <View style={styles.tableHeader}>
        <Bi primary={primary.labels.model} secondary={secondary.labels.model} style={styles.tableCell} subStyle={styles.cellSecondary} />
        <Bi primary={primary.labels.serial} secondary={secondary.labels.serial} style={styles.tableCell} subStyle={styles.cellSecondary} />
        {showSite && <Bi primary={primary.labels.site} secondary={secondary.labels.site} style={styles.tableCell} subStyle={styles.cellSecondary} />}
        <Bi primary={primary.labels.quantity} secondary={secondary.labels.quantity} style={styles.tableCellNum} subStyle={styles.cellSecondary} />
        <Bi primary={primary.labels.unitPrice} secondary={secondary.labels.unitPrice} style={styles.tableCellPrice} subStyle={styles.cellSecondary} />
        <Bi primary={primary.labels.lineTotal} secondary={secondary.labels.lineTotal} style={styles.tableCellTotal} subStyle={styles.cellSecondary} />
      </View>
      {equipment.map((line) => {
        const lineTotal = line.unitPrice !== null ? Number(line.unitPrice) * (line.quantity ?? 1) : null;
        return (
          <View key={line.equipmentId} style={styles.tableRow}>
            <Text style={styles.tableCell}>
              {line.modelCode}
              {"\n"}
              <Text style={{ color: "#666666" }}>{line.modelName}</Text>
            </Text>
            <Text style={styles.tableCell}>{line.serialNumber ?? "—"}</Text>
            {showSite && <Text style={styles.tableCell}>{line.siteName ?? "—"}</Text>}
            <Text style={styles.tableCellNum}>{line.quantity}</Text>
            <Text style={styles.tableCellPrice}>{formatVnd(line.unitPrice)}</Text>
            <Text style={styles.tableCellTotal}>{formatVnd(lineTotal)}</Text>
          </View>
        );
      })}
      <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
        <Text style={styles.tableCell}> </Text>
        <Text style={styles.tableCell}> </Text>
        {showSite && <Text style={styles.tableCell}> </Text>}
        <Text style={styles.tableCellNum}> </Text>
        <Bi
          primary={primary.labels.grandTotal}
          secondary={secondary.labels.grandTotal}
          style={[styles.tableCellPrice, { fontWeight: "bold" }]}
          subStyle={styles.cellSecondary}
        />
        <Text style={[styles.tableCellTotal, { fontWeight: "bold" }]}>{formatVnd(grandTotal)}</Text>
      </View>
    </View>
  );
}

type ClauseKey = "rentalTerm" | "rentalAutoConvert" | "maintenance" | "saleOwnership" | "appendix" | "paymentTerms";

interface ClausesProps extends PairProps {
  contract: PdfContractView;
  clauseKeys: ReadonlyArray<ClauseKey>;
}

function interpolateClause(text: string, key: ClauseKey, contract: PdfContractView): string {
  if (key === "rentalTerm" && contract.termMonths) {
    return interpolate(text, { term: contract.termMonths });
  }
  if (key === "appendix") {
    return interpolate(text, {
      revision: contract.amendmentRevision,
      reason: contract.amendmentReason ?? "—",
    });
  }
  return text;
}

export function PdfClauses({ contract, clauseKeys, primary, secondary }: Readonly<ClausesProps>) {
  return (
    <View>
      <Text style={styles.sectionTitle}>—</Text>
      <Text style={styles.clause}>{primary.clauses.intro}</Text>
      <SecondaryText style={styles.clauseSecondary}>{secondary.clauses.intro}</SecondaryText>
      {clauseKeys.map((key) => (
        <View key={key} wrap={false}>
          <Text style={styles.clause}>{interpolateClause(primary.clauses[key], key, contract)}</Text>
          <SecondaryText style={styles.clauseSecondary}>{interpolateClause(secondary.clauses[key], key, contract)}</SecondaryText>
        </View>
      ))}
      <Text style={styles.clause}>{primary.clauses.signatureBlock}</Text>
      <SecondaryText style={styles.clauseSecondary}>{secondary.clauses.signatureBlock}</SecondaryText>
    </View>
  );
}

interface SignaturesProps extends PairProps {
  customer: PdfCustomerSummary;
  company: PdfCompanyInfo;
}

/**
 * Side-by-side signature blocks. Each box reserves vertical room for an ink
 * signature + company stamp, then prints the responsible party's name beneath
 * the line. Customer side prefers the contract-party name (the natural-person
 * signatory) for B2C; for B2B we surface the legal representative when present
 * and fall back to the contract-party. Company side always shows the Seoul
 * Aqua legal representative pulled from `company.taxInfo`.
 */
export function PdfSignatures({ customer, company, primary, secondary }: Readonly<SignaturesProps>) {
  const customerSignerName =
    customer.contractParty?.name ?? customer.name;
  return (
    <View style={styles.signatureRow}>
      <View style={styles.signatureBox}>
        <Text style={styles.signaturePartyTitle}>Party A</Text>
        <View style={styles.signatureSlot} />
        <Text style={styles.signatureLabel}>{primary.labels.signatureCustomer}</Text>
        <SecondaryText style={styles.signatureLabelSecondary}>{secondary.labels.signatureCustomer}</SecondaryText>
        <Text style={[styles.signatureName, autoFontStyle(customerSignerName)]}>{customerSignerName}</Text>
      </View>
      <View style={styles.signatureBox}>
        <Text style={styles.signaturePartyTitle}>Party B</Text>
        <View style={styles.signatureSlot} />
        <Text style={styles.signatureLabel}>{primary.labels.signatureCompany}</Text>
        <SecondaryText style={styles.signatureLabelSecondary}>{secondary.labels.signatureCompany}</SecondaryText>
        <Text style={[styles.signatureName, autoFontStyle(company.representativeName)]}>{company.representativeName}</Text>
      </View>
    </View>
  );
}

export function PdfFooter({ generatedAt, primary }: Readonly<{ generatedAt: Date; primary: PdfMessages }>) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {primary.labels.generatedAt}: {formatDate(generatedAt)}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          interpolate(primary.labels.pageOf, { page: pageNumber, total: totalPages })
        }
      />
    </View>
  );
}

interface CompanyBlockProps extends PairProps {
  company: PdfCompanyInfo;
  hqPhone: string;
}

/**
 * Issuing-company block: legal name, address, representative, MST and HQ
 * phone. Pulled from SystemSetting (`company.taxInfo` + `company.hqPhone`)
 * by the renderer; here we just lay it out as a card that matches the
 * customer-summary card style above.
 */
export function PdfCompanyBlock({ company, hqPhone, primary, secondary }: Readonly<CompanyBlockProps>) {
  return (
    <View style={styles.card}>
      <View style={{ marginBottom: 6 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0, borderBottomWidth: 0, paddingBottom: 0 }]}>
          {primary.labels.companyBlockTitle}
        </Text>
        <Text style={styles.sectionTitleSecondary}>{secondary.labels.companyBlockTitle}</Text>
      </View>
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.companyLegalName} secondary={secondary.labels.companyLegalName} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Text style={styles.metaValue}>{company.legalName}</Text>
      </View>
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.companyAddress} secondary={secondary.labels.companyAddress} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Text style={styles.metaValue}>{company.address}</Text>
      </View>
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.companyRepresentative} secondary={secondary.labels.companyRepresentative} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Text style={styles.metaValue}>{company.representativeName}</Text>
      </View>
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.companyTaxCode} secondary={secondary.labels.companyTaxCode} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Text style={styles.metaValue}>{company.taxCode}</Text>
      </View>
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.companyPhone} secondary={secondary.labels.companyPhone} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Text style={styles.metaValue}>{hqPhone}</Text>
      </View>
    </View>
  );
}

export interface ContractDocumentProps {
  titleKey: keyof PdfMessages["documentTitle"];
  contract: PdfContractView;
  customer: PdfCustomerSummary;
  equipment: PdfEquipmentLine[];
  langPair: PdfLangPair;
  generatedAt: Date;
  clauseKeys: ReadonlyArray<ClauseKey>;
  company: PdfCompanyInfo;
  hqPhone: string;
}

export function ContractDocument({
  titleKey,
  contract,
  customer,
  equipment,
  langPair,
  generatedAt,
  clauseKeys,
  company,
  hqPhone,
}: Readonly<ContractDocumentProps>) {
  const { primary, secondary } = pickPdfPair(langPair);
  const showSite = customer.type === "B2B";
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.watermark} fixed>
          <Image src={WATERMARK_LOGO_PATH} style={styles.watermarkImage} />
        </View>
        <PdfHeader contract={contract} titleKey={titleKey} customer={customer} primary={primary} secondary={secondary} />
        <PdfPartiesBlock customer={customer} company={company} hqPhone={hqPhone} primary={primary} secondary={secondary} />
        <PdfMeta contract={contract} primary={primary} secondary={secondary} />
        <PdfEquipmentTable equipment={equipment} showSite={showSite} primary={primary} secondary={secondary} />
        <PdfClauses contract={contract} clauseKeys={clauseKeys} primary={primary} secondary={secondary} />
        {contract.notes && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>{primary.labels.notes}</Text>
            <SecondaryText style={styles.sectionTitleSecondary}>{secondary.labels.notes}</SecondaryText>
            <Text style={[styles.clause, autoFontStyle(contract.notes)]}>{contract.notes}</Text>
          </View>
        )}
        <PdfSignatures customer={customer} company={company} primary={primary} secondary={secondary} />
        <PdfFooter generatedAt={generatedAt} primary={primary} />
      </Page>
    </Document>
  );
}
