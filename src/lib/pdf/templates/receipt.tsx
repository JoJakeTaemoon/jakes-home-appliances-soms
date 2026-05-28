/**
 * Receipt PDF (DOCUMENT_TEMPLATES.md #5).
 *
 * Tri-locale (vi / ko / en). Shows customer info, date, amount, method,
 * collector, expected vs collected with carryover note when partial.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type ReceiptLocale = "ko" | "vi" | "en";

export interface ReceiptPayload {
  receiptNumber: string;
  paymentId: string;
  customerName: string;
  customerCode: string;
  customerType: "B2C" | "B2B";
  taxCode: string | null;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  collectedAt: Date;
  collectorName: string;
  method: string;
  expectedAmount: number;
  actualAmount: number;
  carryoverAmount: number;
  reference: string | null;
  notes: string | null;
  locale: ReceiptLocale;
  generatedAt: Date;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#0C6BA8",
    paddingBottom: 8,
    marginBottom: 12,
  },
  brandTitle: { fontSize: 14, fontWeight: "bold", color: "#0C6BA8" },
  brandLegal: { fontSize: 8, color: "#666" },
  docTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 6,
    marginBottom: 16,
    textAlign: "center",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 130, color: "#666" },
  value: { flex: 1, color: "#111" },
  amountBox: {
    marginTop: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: "#0C6BA8",
    borderRadius: 4,
    backgroundColor: "#F0F8FE",
  },
  amountLabel: { fontSize: 10, color: "#525252" },
  amountValue: { fontSize: 22, fontWeight: "bold", color: "#0C6BA8", marginTop: 2 },
  carryover: {
    marginTop: 6,
    color: "#B45309",
    fontSize: 10,
    fontWeight: "bold",
  },
  notes: { marginTop: 12, fontSize: 9, color: "#666", lineHeight: 1.4 },
  signRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 26,
  },
  signBox: { width: "45%", borderTopWidth: 1, borderTopColor: "#111", paddingTop: 4 },
  signLabel: { fontSize: 8, color: "#666", textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#888",
  },
});

interface LabelDict {
  title: string;
  receiptNo: string;
  customer: string;
  customerCode: string;
  taxCode: string;
  address: string;
  contact: string;
  date: string;
  collector: string;
  method: string;
  reference: string;
  expected: string;
  actual: string;
  carryover: string;
  notes: string;
  signedCustomer: string;
  signedCollector: string;
  amountReceived: string;
  generated: string;
}

const LABELS: Record<ReceiptLocale, LabelDict> = {
  vi: {
    title: "HÓA ĐƠN (BIÊN LAI THU TIỀN)",
    receiptNo: "Số biên lai",
    customer: "Khách hàng",
    customerCode: "Mã KH",
    taxCode: "Mã số thuế",
    address: "Địa chỉ",
    contact: "Người liên hệ",
    date: "Ngày thu",
    collector: "Người thu",
    method: "Phương thức",
    reference: "Tham chiếu",
    expected: "Số tiền dự kiến",
    actual: "Số tiền đã thu",
    carryover: "Còn nợ (chuyển sang kỳ sau)",
    notes: "Ghi chú",
    signedCustomer: "Khách hàng ký",
    signedCollector: "Người thu ký",
    amountReceived: "Số tiền thu",
    generated: "Lập lúc",
  },
  ko: {
    title: "영수증 (수금 확인서)",
    receiptNo: "영수증 번호",
    customer: "고객",
    customerCode: "고객코드",
    taxCode: "세금코드",
    address: "주소",
    contact: "연락처",
    date: "수금일",
    collector: "수금자",
    method: "결제방법",
    reference: "참조",
    expected: "예상 금액",
    actual: "수금 금액",
    carryover: "잔여 (다음 차수 이월)",
    notes: "비고",
    signedCustomer: "고객 서명",
    signedCollector: "수금자 서명",
    amountReceived: "수금 금액",
    generated: "발행시각",
  },
  en: {
    title: "RECEIPT (CASH COLLECTION)",
    receiptNo: "Receipt no.",
    customer: "Customer",
    customerCode: "Code",
    taxCode: "Tax code",
    address: "Address",
    contact: "Contact",
    date: "Date",
    collector: "Collected by",
    method: "Method",
    reference: "Reference",
    expected: "Expected amount",
    actual: "Amount collected",
    carryover: "Carryover (next cycle)",
    notes: "Notes",
    signedCustomer: "Customer signature",
    signedCollector: "Collector signature",
    amountReceived: "Amount received",
    generated: "Generated",
  },
};

function formatVnd(n: number): string {
  if (!Number.isFinite(n)) return "0 ₫";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function formatDateTime(d: Date, locale: ReceiptLocale): string {
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x));
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  if (locale === "vi") return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

interface ReceiptProps {
  payload: ReceiptPayload;
}

export function Receipt({ payload }: Readonly<ReceiptProps>) {
  const L = LABELS[payload.locale];
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brand}>
          <View>
            <Text style={styles.brandTitle}>SEOUL AQUA</Text>
            <Text style={styles.brandLegal}>
              CÔNG TY TNHH MTV TM&DV ĐẠI Á
            </Text>
          </View>
          <View>
            <Text style={styles.brandLegal}>cs@seoulaqua.com.vn</Text>
            <Text style={styles.brandLegal}>+84-28-1234-5678</Text>
          </View>
        </View>

        <Text style={styles.docTitle}>{L.title}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{L.receiptNo}:</Text>
            <Text style={styles.value}>{payload.receiptNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{L.date}:</Text>
            <Text style={styles.value}>
              {formatDateTime(payload.collectedAt, payload.locale)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{L.customer}:</Text>
            <Text style={styles.value}>{payload.customerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{L.customerCode}:</Text>
            <Text style={styles.value}>{payload.customerCode}</Text>
          </View>
          {payload.customerType === "B2B" && payload.taxCode && (
            <View style={styles.row}>
              <Text style={styles.label}>{L.taxCode}:</Text>
              <Text style={styles.value}>{payload.taxCode}</Text>
            </View>
          )}
          {payload.address && (
            <View style={styles.row}>
              <Text style={styles.label}>{L.address}:</Text>
              <Text style={styles.value}>{payload.address}</Text>
            </View>
          )}
          {payload.contactName && (
            <View style={styles.row}>
              <Text style={styles.label}>{L.contact}:</Text>
              <Text style={styles.value}>
                {payload.contactName}
                {payload.contactPhone ? ` · ${payload.contactPhone}` : ""}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{L.method}:</Text>
            <Text style={styles.value}>{payload.method}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{L.collector}:</Text>
            <Text style={styles.value}>{payload.collectorName}</Text>
          </View>
          {payload.reference && (
            <View style={styles.row}>
              <Text style={styles.label}>{L.reference}:</Text>
              <Text style={styles.value}>{payload.reference}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>{L.expected}:</Text>
            <Text style={styles.value}>{formatVnd(payload.expectedAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{L.actual}:</Text>
            <Text style={styles.value}>{formatVnd(payload.actualAmount)}</Text>
          </View>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>{L.amountReceived}</Text>
          <Text style={styles.amountValue}>
            {formatVnd(payload.actualAmount)}
          </Text>
          {payload.carryoverAmount > 0 && (
            <Text style={styles.carryover}>
              {L.carryover}: {formatVnd(payload.carryoverAmount)}
            </Text>
          )}
        </View>

        {payload.notes && (
          <Text style={styles.notes}>
            {L.notes}: {payload.notes}
          </Text>
        )}

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>{L.signedCollector}</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>{L.signedCustomer}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {L.generated}: {formatDateTime(payload.generatedAt, payload.locale)}
          </Text>
          <Text>{payload.paymentId.slice(-12).toUpperCase()}</Text>
        </View>
      </Page>
    </Document>
  );
}
