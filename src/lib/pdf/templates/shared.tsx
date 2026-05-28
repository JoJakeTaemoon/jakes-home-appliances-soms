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

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type {
  PdfContractView,
  PdfCustomerSummary,
  PdfEquipmentLine,
  PdfLangPair,
} from "@/lib/pdf/types";
import { pickPdfPair, interpolate, type PdfMessages } from "@/lib/pdf/messages";

export const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#111111",
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#0C6BA8", // brand blue
    paddingBottom: 8,
    marginBottom: 12,
  },
  brandTitle: { fontSize: 14, fontWeight: "bold", color: "#0C6BA8" },
  brandLegal: { fontSize: 8, color: "#666666" },
  docTitle: { fontSize: 16, fontWeight: "bold", marginTop: 6, textAlign: "center" },
  docTitleSecondary: {
    fontSize: 11,
    fontWeight: "normal",
    color: "#555555",
    marginBottom: 14,
    textAlign: "center",
  },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 130, color: "#666666" },
  metaLabelSecondary: { fontSize: 8, color: "#999999" },
  metaValue: { flex: 1, color: "#111111" },
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
    marginTop: 36,
  },
  signatureBox: {
    width: "45%",
    borderTopWidth: 1,
    borderTopColor: "#111111",
    paddingTop: 4,
    alignItems: "center",
  },
  signatureLabel: { fontSize: 9, color: "#111111", textAlign: "center" },
  signatureLabelSecondary: { fontSize: 8, color: "#777777", textAlign: "center" },
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
});

/**
 * Bilingual stacked text: primary on top, secondary beneath it in `subStyle`.
 * Uses nested <Text> + newline so it fits anywhere a single <Text> did.
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
  return (
    <Text style={style}>
      {primary}
      {"\n"}
      <Text style={subStyle}>{secondary}</Text>
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

export function PdfHeader({ contract, titleKey, customer, primary, secondary }: Readonly<HeaderProps>) {
  return (
    <>
      <View style={styles.brandHeader}>
        <View>
          <Text style={styles.brandTitle}>SEOUL AQUA</Text>
          <Text style={styles.brandLegal}>{primary.labels.seoulAquaLegalName}</Text>
        </View>
        <View style={{ textAlign: "right" }}>
          <Bi
            primary={primary.labels.contractNumber}
            secondary={secondary.labels.contractNumber}
            style={{ fontSize: 9, color: "#666666" }}
            subStyle={{ fontSize: 7.5, color: "#999999" }}
          />
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#111111" }}>
            {contract.contractNumber}
          </Text>
        </View>
      </View>
      <Text style={styles.docTitle}>{primary.documentTitle[titleKey]}</Text>
      <Text style={styles.docTitleSecondary}>{secondary.documentTitle[titleKey]}</Text>

      <View style={styles.card}>
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.customerName} secondary={secondary.labels.customerName} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>{customer.name} ({customer.code})</Text>
        </View>
        {customer.type === "B2B" && customer.taxCode && (
          <View style={styles.metaRow}>
            <Bi primary={primary.labels.taxCode} secondary={secondary.labels.taxCode} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
            <Text style={styles.metaValue}>{customer.taxCode}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <Bi primary={primary.labels.address} secondary={secondary.labels.address} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
          <Text style={styles.metaValue}>
            {[customer.address, customer.district, customer.city].filter(Boolean).join(", ") || "—"}
          </Text>
        </View>
        {customer.contractParty && (
          <>
            <View style={styles.metaRow}>
              <Bi primary={primary.labels.contactName} secondary={secondary.labels.contactName} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
              <Text style={styles.metaValue}>
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
    </>
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
      <View style={styles.metaRow}>
        <Bi primary={primary.labels.state} secondary={secondary.labels.state} style={styles.metaLabel} subStyle={styles.metaLabelSecondary} />
        <Text style={styles.metaValue}>{contract.state}</Text>
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
        <Text style={styles.sectionTitleSecondary}>{secondary.labels.equipmentLines}</Text>
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
      <Text style={styles.clauseSecondary}>{secondary.clauses.intro}</Text>
      {clauseKeys.map((key) => (
        <View key={key} wrap={false}>
          <Text style={styles.clause}>{interpolateClause(primary.clauses[key], key, contract)}</Text>
          <Text style={styles.clauseSecondary}>{interpolateClause(secondary.clauses[key], key, contract)}</Text>
        </View>
      ))}
      <Text style={styles.clause}>{primary.clauses.signatureBlock}</Text>
      <Text style={styles.clauseSecondary}>{secondary.clauses.signatureBlock}</Text>
    </View>
  );
}

export function PdfSignatures({ primary, secondary }: Readonly<PairProps>) {
  return (
    <View style={styles.signatureRow}>
      <View style={styles.signatureBox}>
        <Text style={styles.signatureLabel}>{primary.labels.signatureCustomer}</Text>
        <Text style={styles.signatureLabelSecondary}>{secondary.labels.signatureCustomer}</Text>
      </View>
      <View style={styles.signatureBox}>
        <Text style={styles.signatureLabel}>{primary.labels.signatureCompany}</Text>
        <Text style={styles.signatureLabelSecondary}>{secondary.labels.signatureCompany}</Text>
      </View>
    </View>
  );
}

export function PdfFooter({ generatedAt, primary }: Readonly<{ generatedAt: Date; primary: PdfMessages }>) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {primary.labels.generatedAt}: {formatDate(generatedAt)} ·{" "}
        {generatedAt.toISOString().slice(11, 16)} UTC
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          interpolate(primary.labels.pageOf, { page: pageNumber, total: totalPages })
        }
      />
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
}

export function ContractDocument({
  titleKey,
  contract,
  customer,
  equipment,
  langPair,
  generatedAt,
  clauseKeys,
}: Readonly<ContractDocumentProps>) {
  const { primary, secondary } = pickPdfPair(langPair);
  const showSite = customer.type === "B2B";
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <PdfHeader contract={contract} titleKey={titleKey} customer={customer} primary={primary} secondary={secondary} />
        <PdfMeta contract={contract} primary={primary} secondary={secondary} />
        <PdfEquipmentTable equipment={equipment} showSite={showSite} primary={primary} secondary={secondary} />
        <PdfClauses contract={contract} clauseKeys={clauseKeys} primary={primary} secondary={secondary} />
        {contract.notes && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>{primary.labels.notes}</Text>
            <Text style={styles.sectionTitleSecondary}>{secondary.labels.notes}</Text>
            <Text style={styles.clause}>{contract.notes}</Text>
          </View>
        )}
        <PdfSignatures primary={primary} secondary={secondary} />
        <PdfFooter generatedAt={generatedAt} primary={primary} />
      </Page>
    </Document>
  );
}
