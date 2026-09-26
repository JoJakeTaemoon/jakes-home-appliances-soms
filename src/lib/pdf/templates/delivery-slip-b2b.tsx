/**
 * B2B Delivery Slip PDF — Mẫu số 02-VT (DOCUMENT_TEMPLATES.md §3).
 *
 * 베트남 정부 양식 (QĐ 48/2006/QĐ-BTC). 정부 양식 특성상 절취선 + 두 부 동시
 * 인쇄 패턴이 아니며 1장에 단일 양식이 표시된다. 회사는 동일 양식을 두 번
 * 인쇄해서 1부는 고객(받는이) 측에 1부는 회사 보관용으로 사용한다.
 *
 * 한 장에 동일 내용 2부 (상·하단) 로 표시해서 사용자가 한번에 인쇄할 수 있게
 * 한다 (다른 서류와 일관성). 다만 정부 양식 글귀는 그대로 유지.
 */

import path from "node:path";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { Bi } from "./shared";
import { splitLangPair, type PdfLangPair } from "@/lib/pdf/types";
import { PDF_DEFAULT_FAMILY, PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

// Watermark logo — same source as the contract templates (shared.tsx).
const WATERMARK_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "logo",
  "jakes-home-appliances-logo.jpg",
);

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;
function autoFont(s: string | null | undefined) {
  return s && HANGUL_RE.test(s)
    ? { fontFamily: PDF_FONT_FAMILY.ko }
    : { fontFamily: PDF_DEFAULT_FAMILY };
}

type DocLocale = "ko" | "vi" | "en";

export interface DeliverySlipLine {
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
  unit: string; // ĐVT — e.g. "Cái", "대", "ea"
  quantity: number;
  unitPrice: number | null;
}

export interface DeliverySlipB2bPayload {
  slipNumber: string; // SỐ
  visitNumber: string;
  contractNumber: string | null;
  customerName: string;
  customerCode: string;
  customerTaxCode: string | null;
  customerAddress: string;
  siteName: string | null;
  siteAddress: string | null;
  recipientName: string; // người nhận hàng (contractParty.name)
  recipientTitle: string | null;
  deliveryDate: Date;
  technicianName: string;
  reason: string; // Lý do xuất kho
  warehouse: string; // Xuất tại kho — default "Kho TP. HCM"
  lines: DeliverySlipLine[];
  notes: string | null;
  hqPhone: string;
  langPair: PdfLangPair;
  generatedAt: Date;
}

const SHEET_PAD = 22;
const COPY_GAP = 12;

const styles = StyleSheet.create({
  page: { padding: 14, fontSize: 9, fontFamily: PDF_DEFAULT_FAMILY, color: "#111" },
  copy: { borderWidth: 1, borderColor: "#222", padding: 10, position: "relative" },
  // 정부 양식 헤더 — 회사정보 좌, 양식코드 우
  govHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  govHeadLeft: { flex: 1 },
  govHeadRight: { width: 200, alignItems: "flex-end" },
  govLineBold: { fontSize: 9, fontWeight: "bold" },
  govLine: { fontSize: 8 },
  govLineSec: { fontSize: 7, color: "#666" },
  govFormCode: { fontSize: 7.5, textAlign: "right" },

  docTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 4,
  },
  docTitleSec: {
    fontSize: 9,
    fontWeight: "normal",
    color: "#555",
    textAlign: "center",
    marginBottom: 2,
  },
  docDate: { fontSize: 9, textAlign: "center", color: "#444", marginBottom: 4 },

  metaCard: {
    borderWidth: 0.7,
    borderColor: "#bbb",
    padding: 6,
    marginBottom: 4,
  },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 130, fontSize: 8, color: "#444" },
  metaLabelSec: { fontSize: 7, color: "#888" },
  metaValue: { flex: 1, fontSize: 8.5, color: "#111", fontWeight: "bold" },

  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#222",
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#bbb",
  },
  cIdx: { width: 22, fontSize: 8 },
  cName: { flex: 1.8, fontSize: 8 },
  cCode: { width: 70, fontSize: 7.5 },
  cUnit: { width: 36, textAlign: "center", fontSize: 8 },
  cQty: { width: 38, textAlign: "right", fontSize: 8 },
  cPrice: { width: 70, textAlign: "right", fontSize: 8 },
  cTotal: { width: 84, textAlign: "right", fontSize: 8 },
  cHeadText: { fontSize: 7.5, fontWeight: "bold", color: "#222" },
  cHeadSec: { fontSize: 6.5, fontWeight: "normal", color: "#666" },

  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderTopWidth: 1,
    borderTopColor: "#222",
  },
  totalLabel: { flex: 1, fontSize: 9, fontWeight: "bold" },
  totalValue: { width: 84, textAlign: "right", fontSize: 9, fontWeight: "bold" },

  notesBlock: { marginTop: 4, marginBottom: 6 },
  notesValue: { fontSize: 8, color: "#111" },

  signGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  signBox: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  signTitle: { fontSize: 7.5, fontWeight: "bold", textAlign: "center" },
  signTitleSec: {
    fontSize: 6.5,
    fontWeight: "normal",
    color: "#888",
    textAlign: "center",
    marginBottom: 1,
  },
  signParen: { fontSize: 6.5, color: "#777", textAlign: "center", marginBottom: 3 },
  signSpace: { width: "100%", height: 22 },
  signNameLine: { fontSize: 7, color: "#666", textAlign: "center" },

  tearWrap: {
    height: COPY_GAP,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  tearText: { fontSize: 7, color: "#999", marginHorizontal: 6 },
  tearDash: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    borderBottomStyle: "dashed",
  },

  // Centered watermark logo — printed once per page behind both copies.
  watermark: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.07,
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkImage: { width: 200, height: 200, objectFit: "contain" },
});

interface LabelDict {
  title: string;
  copyCustomer: string;
  copyCompany: string;
  formCode: string;
  formDecree: string;
  unitLabel: string;
  unitAddress: string;
  unitTaxCode: string;
  slipNo: string;
  date: string;
  recipientName: string;
  recipientUnit: string;
  recipientAddress: string;
  warehouse: string;
  reason: string;
  contractNo: string;
  idx: string;
  productName: string;
  productCode: string;
  unitOfMeasure: string;
  qty: string;
  unitPrice: string;
  amount: string;
  total: string;
  notes: string;
  signWriter: string;
  signReceiver: string;
  signWarehouse: string;
  signChiefAcct: string;
  signParen: string;
  tearHere: string;
  copyOf: string;
}

const LABELS: Record<DocLocale, LabelDict> = {
  vi: {
    title: "PHIẾU XUẤT KHO",
    copyCustomer: "Liên 2 — Giao khách hàng",
    copyCompany: "Liên 1 — Lưu nội bộ",
    formCode: "Mẫu số 02 - VT",
    formDecree: "(Ban hành theo QĐ số 48/2006/QĐ-BTC)",
    unitLabel: "Đơn vị",
    unitAddress: "Địa chỉ",
    unitTaxCode: "MST",
    slipNo: "Số",
    date: "Ngày",
    recipientName: "Họ tên người nhận hàng",
    recipientUnit: "Đơn vị nhận",
    recipientAddress: "Địa chỉ giao hàng",
    warehouse: "Xuất tại kho",
    reason: "Lý do xuất kho",
    contractNo: "Số HĐ",
    idx: "STT",
    productName: "Tên, nhãn hiệu, quy cách, phẩm chất vật tư",
    productCode: "Mã số",
    unitOfMeasure: "ĐVT",
    qty: "Số lượng",
    unitPrice: "Đơn giá",
    amount: "Thành tiền",
    total: "Cộng tiền hàng",
    notes: "Ghi chú",
    signWriter: "Người lập phiếu",
    signReceiver: "Người nhận hàng",
    signWarehouse: "Thủ kho",
    signChiefAcct: "Kế toán trưởng",
    signParen: "(Ký, họ tên)",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
    copyOf: "/",
  },
  ko: {
    title: "출고서 (B2B 납품)",
    copyCustomer: "사본 2 — 고객 인도",
    copyCompany: "사본 1 — 회사 보관",
    formCode: "양식 02-VT (베트남 정부 양식)",
    formDecree: "(재무부 QĐ 48/2006/QĐ-BTC)",
    unitLabel: "회사",
    unitAddress: "주소",
    unitTaxCode: "세금코드",
    slipNo: "번호",
    date: "발행일",
    recipientName: "수령자 성명",
    recipientUnit: "수령 회사",
    recipientAddress: "수령 주소",
    warehouse: "출고 창고",
    reason: "출고 사유",
    contractNo: "계약 번호",
    idx: "순번",
    productName: "품명·규격",
    productCode: "코드",
    unitOfMeasure: "단위",
    qty: "수량",
    unitPrice: "단가",
    amount: "금액",
    total: "합계",
    notes: "비고",
    signWriter: "인계자/작업자",
    signReceiver: "수령자",
    signWarehouse: "창고 책임자",
    signChiefAcct: "회계부장",
    signParen: "(서명·성명)",
    tearHere: "이 선을 따라 자르세요",
    copyOf: "/",
  },
  en: {
    title: "DELIVERY SLIP",
    copyCustomer: "Copy 2 — Customer",
    copyCompany: "Copy 1 — Company file",
    formCode: "Form 02-VT (VN MOF)",
    formDecree: "(Issued per QĐ 48/2006/QĐ-BTC)",
    unitLabel: "Company",
    unitAddress: "Address",
    unitTaxCode: "Tax code",
    slipNo: "No.",
    date: "Date",
    recipientName: "Recipient name",
    recipientUnit: "Recipient unit",
    recipientAddress: "Delivery address",
    warehouse: "Warehouse",
    reason: "Reason for issue",
    contractNo: "Contract no.",
    idx: "#",
    productName: "Product / spec / quality",
    productCode: "Code",
    unitOfMeasure: "UoM",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    total: "Total",
    notes: "Notes",
    signWriter: "Issuer",
    signReceiver: "Recipient",
    signWarehouse: "Warehouse keeper",
    signChiefAcct: "Chief accountant",
    signParen: "(Sign / name)",
    tearHere: "CUT ALONG THIS LINE",
    copyOf: "/",
  },
};

function formatVnd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function formatDate(d: Date): string {
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const COMPANY = {
  legalName: "CÔNG TY TNHH MTV TM&DV JAKE'S HA",
  brandName: "JAKE'S HOME APPLIANCES",
  address: "TP. HCM, Việt Nam",
  taxCode: "0316XXXXXX",
};

function CopyBlock({
  payload,
  P,
  S,
  copyLabel,
}: Readonly<{
  payload: DeliverySlipB2bPayload;
  P: LabelDict;
  S: LabelDict;
  copyLabel: string;
}>) {
  const recipientAddress = payload.siteAddress ?? payload.customerAddress;
  let grandTotal = 0;
  for (const l of payload.lines) {
    if (l.unitPrice !== null) grandTotal += l.unitPrice * l.quantity;
  }
  return (
    <View style={styles.copy}>
      <View style={styles.watermark}>
        <Image src={WATERMARK_LOGO_PATH} style={styles.watermarkImage} />
      </View>
      <View style={styles.govHead}>
        <View style={styles.govHeadLeft}>
          <Text style={styles.govLineBold}>{COMPANY.brandName}</Text>
          <Text style={styles.govLine}>{COMPANY.legalName}</Text>
          <View style={styles.metaRow}>
            <Bi
              primary={`${P.unitAddress}:`}
              secondary={S.unitAddress}
              style={styles.metaLabel}
              subStyle={styles.metaLabelSec}
            />
            <Text style={styles.metaValue}>{COMPANY.address}</Text>
          </View>
          <View style={styles.metaRow}>
            <Bi
              primary={`${P.unitTaxCode}:`}
              secondary={S.unitTaxCode}
              style={styles.metaLabel}
              subStyle={styles.metaLabelSec}
            />
            <Text style={styles.metaValue}>{COMPANY.taxCode}</Text>
          </View>
        </View>
        <View style={styles.govHeadRight}>
          <Text style={styles.govFormCode}>{P.formCode}</Text>
          <Text style={styles.govLineSec}>{P.formDecree}</Text>
          <Text style={[styles.govLineSec, autoFont(S.formCode)]}>
            {S.formCode}
          </Text>
        </View>
      </View>

      <Text style={[styles.docTitle, autoFont(P.title)]}>{P.title}</Text>
      <Text style={[styles.docTitleSec, autoFont(S.title)]}>
        {S.title} · {copyLabel}
      </Text>
      <Text style={styles.docDate}>
        {P.date} {formatDate(payload.deliveryDate)} — {P.slipNo} {payload.slipNumber}
      </Text>

      <View style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Bi
            primary={`${P.recipientName}:`}
            secondary={S.recipientName}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.metaValue, autoFont(payload.recipientName)]}>
            {payload.recipientName}
            {payload.recipientTitle ? ` (${payload.recipientTitle})` : ""}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Bi
            primary={`${P.recipientUnit}:`}
            secondary={S.recipientUnit}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.metaValue, autoFont(payload.customerName)]}>
            {payload.customerName} ({payload.customerCode})
            {payload.customerTaxCode ? ` · MST: ${payload.customerTaxCode}` : ""}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Bi
            primary={`${P.recipientAddress}:`}
            secondary={S.recipientAddress}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.metaValue, autoFont(recipientAddress)]}>
            {payload.siteName ? `${payload.siteName} — ` : ""}
            {recipientAddress}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Bi
            primary={`${P.warehouse}:`}
            secondary={S.warehouse}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={styles.metaValue}>{payload.warehouse}</Text>
        </View>
        <View style={styles.metaRow}>
          <Bi
            primary={`${P.reason}:`}
            secondary={S.reason}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.metaValue, autoFont(payload.reason)]}>
            {payload.reason}
          </Text>
        </View>
        {payload.contractNumber && (
          <View style={styles.metaRow}>
            <Bi
              primary={`${P.contractNo}:`}
              secondary={S.contractNo}
              style={styles.metaLabel}
              subStyle={styles.metaLabelSec}
            />
            <Text style={styles.metaValue}>{payload.contractNumber}</Text>
          </View>
        )}
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.cIdx, styles.cHeadText]}>{P.idx}</Text>
        <Text style={[styles.cName, styles.cHeadText]}>
          {P.productName}
          {"\n"}
          <Text style={[styles.cHeadSec, autoFont(S.productName)]}>{S.productName}</Text>
        </Text>
        <Text style={[styles.cCode, styles.cHeadText]}>
          {P.productCode}
          {"\n"}
          <Text style={[styles.cHeadSec, autoFont(S.productCode)]}>{S.productCode}</Text>
        </Text>
        <Text style={[styles.cUnit, styles.cHeadText]}>{P.unitOfMeasure}</Text>
        <Text style={[styles.cQty, styles.cHeadText]}>{P.qty}</Text>
        <Text style={[styles.cPrice, styles.cHeadText]}>{P.unitPrice}</Text>
        <Text style={[styles.cTotal, styles.cHeadText]}>{P.amount}</Text>
      </View>
      {payload.lines.map((l, idx) => {
        const total = l.unitPrice !== null ? l.unitPrice * l.quantity : null;
        return (
          <View key={`${l.modelCode}-${idx}`} style={styles.tableRow}>
            <Text style={styles.cIdx}>{idx + 1}</Text>
            <Text style={styles.cName}>
              {l.modelName}
              {l.serialNumber ? `\nS/N: ${l.serialNumber}` : ""}
            </Text>
            <Text style={styles.cCode}>{l.modelCode}</Text>
            <Text style={styles.cUnit}>{l.unit}</Text>
            <Text style={styles.cQty}>{l.quantity}</Text>
            <Text style={styles.cPrice}>{formatVnd(l.unitPrice)}</Text>
            <Text style={styles.cTotal}>{formatVnd(total)}</Text>
          </View>
        );
      })}

      <View style={styles.totalRow}>
        <Bi
          primary={P.total}
          secondary={S.total}
          style={styles.totalLabel}
          subStyle={{ fontSize: 7, fontWeight: "normal", color: "#666" }}
        />
        <Text style={styles.totalValue}>{formatVnd(grandTotal)}</Text>
      </View>

      {payload.notes && (
        <View style={styles.notesBlock}>
          <Bi
            primary={`${P.notes}:`}
            secondary={S.notes}
            style={{ fontSize: 8, color: "#666" }}
            subStyle={{ fontSize: 7, color: "#999" }}
          />
          <Text style={[styles.notesValue, autoFont(payload.notes)]}>
            {payload.notes}
          </Text>
        </View>
      )}

      <View style={{ flexGrow: 1 }} />
      <View style={styles.signGrid}>
        <View style={styles.signBox}>
          <Text style={[styles.signTitle, autoFont(P.signWriter)]}>{P.signWriter}</Text>
          <Text style={[styles.signTitleSec, autoFont(S.signWriter)]}>{S.signWriter}</Text>
          <Text style={styles.signParen}>{P.signParen}</Text>
          <View style={styles.signSpace} />
          <Text style={[styles.signNameLine, autoFont(payload.technicianName)]}>
            {payload.technicianName}
          </Text>
        </View>
        <View style={styles.signBox}>
          <Text style={[styles.signTitle, autoFont(P.signReceiver)]}>{P.signReceiver}</Text>
          <Text style={[styles.signTitleSec, autoFont(S.signReceiver)]}>{S.signReceiver}</Text>
          <Text style={styles.signParen}>{P.signParen}</Text>
          <View style={styles.signSpace} />
          <Text style={[styles.signNameLine, autoFont(payload.recipientName)]}>
            {payload.recipientName}
          </Text>
        </View>
        <View style={styles.signBox}>
          <Text style={[styles.signTitle, autoFont(P.signWarehouse)]}>{P.signWarehouse}</Text>
          <Text style={[styles.signTitleSec, autoFont(S.signWarehouse)]}>
            {S.signWarehouse}
          </Text>
          <Text style={styles.signParen}>{P.signParen}</Text>
          <View style={styles.signSpace} />
          <Text style={styles.signNameLine}> </Text>
        </View>
        <View style={styles.signBox}>
          <Text style={[styles.signTitle, autoFont(P.signChiefAcct)]}>
            {P.signChiefAcct}
          </Text>
          <Text style={[styles.signTitleSec, autoFont(S.signChiefAcct)]}>
            {S.signChiefAcct}
          </Text>
          <Text style={styles.signParen}>{P.signParen}</Text>
          <View style={styles.signSpace} />
          <Text style={styles.signNameLine}> </Text>
        </View>
      </View>
    </View>
  );
}

export function DeliverySlipB2B({
  payload,
}: Readonly<{ payload: DeliverySlipB2bPayload }>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const tearText = `${P.tearHere} ✂ ${S.tearHere}`;
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={false}>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCustomer} />
        <View style={styles.tearWrap} wrap={false}>
          <View style={styles.tearDash} />
          <Text style={[styles.tearText, autoFont(tearText)]}>{tearText}</Text>
          <View style={styles.tearDash} />
        </View>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCompany} />
      </Page>
    </Document>
  );
}
