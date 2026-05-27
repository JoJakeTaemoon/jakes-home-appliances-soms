/**
 * Shared layout primitives + StyleSheet used by all contract templates.
 *
 * - Page header with Seoul Aqua brand + contract number.
 * - Customer card.
 * - Equipment table.
 * - Signature block.
 *
 * Each template (B2C sale / B2C rental / B2B / maintenance / appendix)
 * imports these primitives and composes them with locale-aware messages
 * + clauses.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PdfContractView, PdfCustomerSummary, PdfEquipmentLine, PdfLocale } from "@/lib/pdf/types";
import { pickPdfMessages, interpolate } from "@/lib/pdf/messages";

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
  docTitle: { fontSize: 16, fontWeight: "bold", marginTop: 6, marginBottom: 14, textAlign: "center" },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 110, color: "#666666" },
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
  clause: { marginBottom: 6, lineHeight: 1.4 },
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

function formatDate(value: Date | null | undefined, locale: PdfLocale): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (locale === "vi") return `${day}/${m}/${y}`;
  return `${y}-${m}-${day}`;
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

interface HeaderProps {
  contract: PdfContractView;
  locale: PdfLocale;
  title: string;
  customer: PdfCustomerSummary;
}

export function PdfHeader({ contract, locale, title, customer }: HeaderProps) {
  const msg = pickPdfMessages(locale);
  return (
    <>
      <View style={styles.brandHeader}>
        <View>
          <Text style={styles.brandTitle}>SEOUL AQUA</Text>
          <Text style={styles.brandLegal}>{msg.labels.seoulAquaLegalName}</Text>
        </View>
        <View style={{ textAlign: "right" }}>
          <Text style={{ fontSize: 9, color: "#666666" }}>{msg.labels.contractNumber}</Text>
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#111111" }}>
            {contract.contractNumber}
          </Text>
        </View>
      </View>
      <Text style={styles.docTitle}>{title}</Text>

      <View style={styles.card}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.customerName}</Text>
          <Text style={styles.metaValue}>{customer.name} ({customer.code})</Text>
        </View>
        {customer.type === "B2B" && customer.taxCode && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{msg.labels.taxCode}</Text>
            <Text style={styles.metaValue}>{customer.taxCode}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.address}</Text>
          <Text style={styles.metaValue}>
            {[customer.address, customer.district, customer.city].filter(Boolean).join(", ") || "—"}
          </Text>
        </View>
        {customer.contractParty && (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{msg.labels.contactName}</Text>
              <Text style={styles.metaValue}>
                {customer.contractParty.name}
                {customer.contractParty.title ? ` (${customer.contractParty.title})` : ""}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{msg.labels.contactPhone}</Text>
              <Text style={styles.metaValue}>{customer.contractParty.phone}</Text>
            </View>
            {customer.contractParty.email && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{msg.labels.contactEmail}</Text>
                <Text style={styles.metaValue}>{customer.contractParty.email}</Text>
              </View>
            )}
          </>
        )}
      </View>
    </>
  );
}

interface MetaProps {
  contract: PdfContractView;
  locale: PdfLocale;
}

export function PdfMeta({ contract, locale }: MetaProps) {
  const msg = pickPdfMessages(locale);
  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{msg.labels.contractType}</Text>
        <Text style={styles.metaValue}>{msg.labels.type[contract.type]}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{msg.labels.state}</Text>
        <Text style={styles.metaValue}>{contract.state}</Text>
      </View>
      {contract.startDate && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.startDate}</Text>
          <Text style={styles.metaValue}>{formatDate(contract.startDate, locale)}</Text>
        </View>
      )}
      {contract.endDate && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.endDate}</Text>
          <Text style={styles.metaValue}>{formatDate(contract.endDate, locale)}</Text>
        </View>
      )}
      {contract.termMonths !== null && contract.termMonths !== undefined && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.termMonths}</Text>
          <Text style={styles.metaValue}>{contract.termMonths}</Text>
        </View>
      )}
      {contract.monthlyMaintenanceFee !== null && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.monthlyFee}</Text>
          <Text style={styles.metaValue}>{formatVnd(contract.monthlyMaintenanceFee)}</Text>
        </View>
      )}
      {contract.totalContractValue !== null && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{msg.labels.totalValue}</Text>
          <Text style={styles.metaValue}>{formatVnd(contract.totalContractValue)}</Text>
        </View>
      )}
      {contract.amendmentRevision > 0 && contract.parentContractNumber && (
        <>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{msg.labels.parentContractNumber}</Text>
            <Text style={styles.metaValue}>{contract.parentContractNumber}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{msg.labels.revision}</Text>
            <Text style={styles.metaValue}>A{contract.amendmentRevision}</Text>
          </View>
        </>
      )}
    </View>
  );
}

interface EquipmentTableProps {
  equipment: PdfEquipmentLine[];
  locale: PdfLocale;
  showSite: boolean;
}

export function PdfEquipmentTable({ equipment, locale, showSite }: EquipmentTableProps) {
  const msg = pickPdfMessages(locale);
  let grandTotal = 0;
  for (const e of equipment) {
    if (e.unitPrice !== null) grandTotal += Number(e.unitPrice) * (e.quantity ?? 1);
  }
  return (
    <View>
      <Text style={styles.sectionTitle}>{msg.labels.equipmentLines}</Text>
      <View style={styles.tableHeader}>
        <Text style={styles.tableCell}>{msg.labels.model}</Text>
        <Text style={styles.tableCell}>{msg.labels.serial}</Text>
        {showSite && <Text style={styles.tableCell}>{msg.labels.site}</Text>}
        <Text style={styles.tableCellNum}>{msg.labels.quantity}</Text>
        <Text style={styles.tableCellPrice}>{msg.labels.unitPrice}</Text>
        <Text style={styles.tableCellTotal}>{msg.labels.lineTotal}</Text>
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
        <Text style={[styles.tableCellPrice, { fontWeight: "bold" }]}>
          {msg.labels.grandTotal}
        </Text>
        <Text style={[styles.tableCellTotal, { fontWeight: "bold" }]}>
          {formatVnd(grandTotal)}
        </Text>
      </View>
    </View>
  );
}

export function PdfClauses({ children, locale }: { children: React.ReactNode; locale: PdfLocale }) {
  const msg = pickPdfMessages(locale);
  return (
    <View>
      <Text style={styles.sectionTitle}>—</Text>
      <Text style={styles.clause}>{msg.clauses.intro}</Text>
      {children}
      <Text style={styles.clause}>{msg.clauses.signatureBlock}</Text>
    </View>
  );
}

export function PdfSignatures({ locale }: { locale: PdfLocale }) {
  const msg = pickPdfMessages(locale);
  return (
    <View style={styles.signatureRow}>
      <View style={styles.signatureBox}>
        <Text style={styles.signatureLabel}>{msg.labels.signatureCustomer}</Text>
      </View>
      <View style={styles.signatureBox}>
        <Text style={styles.signatureLabel}>{msg.labels.signatureCompany}</Text>
      </View>
    </View>
  );
}

export function PdfFooter({ generatedAt, locale }: { generatedAt: Date; locale: PdfLocale }) {
  const msg = pickPdfMessages(locale);
  return (
    <View style={styles.footer} fixed>
      <Text>
        {msg.labels.generatedAt}: {formatDate(generatedAt, locale)} ·{" "}
        {generatedAt.toISOString().slice(11, 16)} UTC
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          interpolate(msg.labels.pageOf, { page: pageNumber, total: totalPages })
        }
      />
    </View>
  );
}

export interface ContractDocumentProps {
  title: string;
  contract: PdfContractView;
  customer: PdfCustomerSummary;
  equipment: PdfEquipmentLine[];
  locale: PdfLocale;
  generatedAt: Date;
  clauseKeys: ReadonlyArray<"rentalTerm" | "rentalAutoConvert" | "maintenance" | "saleOwnership" | "appendix" | "paymentTerms">;
}

export function ContractDocument({
  title,
  contract,
  customer,
  equipment,
  locale,
  generatedAt,
  clauseKeys,
}: ContractDocumentProps) {
  const msg = pickPdfMessages(locale);
  const showSite = customer.type === "B2B";
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <PdfHeader contract={contract} locale={locale} title={title} customer={customer} />
        <PdfMeta contract={contract} locale={locale} />
        <PdfEquipmentTable equipment={equipment} locale={locale} showSite={showSite} />
        <PdfClauses locale={locale}>
          {clauseKeys.map((key) => {
            let text = msg.clauses[key];
            if (key === "rentalTerm" && contract.termMonths) {
              text = interpolate(text, { term: contract.termMonths });
            }
            if (key === "appendix") {
              text = interpolate(text, {
                revision: contract.amendmentRevision,
                reason: contract.amendmentReason ?? "—",
              });
            }
            return (
              <Text style={styles.clause} key={key}>
                {text}
              </Text>
            );
          })}
        </PdfClauses>
        {contract.notes && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.sectionTitle}>{msg.labels.notes}</Text>
            <Text style={styles.clause}>{contract.notes}</Text>
          </View>
        )}
        <PdfSignatures locale={locale} />
        <PdfFooter generatedAt={generatedAt} locale={locale} />
      </Page>
    </Document>
  );
}
