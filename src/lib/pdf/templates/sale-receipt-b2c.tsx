/**
 * Sale Receipt PDF (B2C SALE install — DOCUMENT_TEMPLATES.md §5).
 *
 * 판매 영수증 + 출고서 겸용. A4 한 장에 2부 + 절취선.
 * 임대(delivery-receipt)와 달리 단가/수량/합계 + 결제 방법이 핵심.
 */

import path from "node:path";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { Bi } from "./shared";
import { splitLangPair, type PdfLangPair } from "@/lib/pdf/types";
import { PDF_DEFAULT_FAMILY, PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

const WATERMARK_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "logo",
  "seoul-aqua-logo.jpg",
);

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;
function autoFont(s: string | null | undefined) {
  return s && HANGUL_RE.test(s)
    ? { fontFamily: PDF_FONT_FAMILY.ko }
    : { fontFamily: PDF_DEFAULT_FAMILY };
}

type DocLocale = "ko" | "vi" | "en";

export interface SaleReceiptLine {
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
  unitPrice: number;
  quantity: number;
}

export interface SaleReceiptPayload {
  receiptNumber: string;
  visitNumber: string;
  contractNumber: string | null;
  customerName: string;
  customerCode: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  saleDate: Date;
  technicianName: string;
  lines: SaleReceiptLine[];
  paymentMethod: string; // CASH / BANK_TRANSFER / CARD / OTHER
  notes: string | null;
  hqPhone: string;
  langPair: PdfLangPair;
  generatedAt: Date;
}

const SHEET_PAD = 22;
const COPY_GAP = 12;

const styles = StyleSheet.create({
  page: { padding: 14, fontSize: 9, fontFamily: PDF_DEFAULT_FAMILY, color: "#111" },
  copy: { borderWidth: 1, borderColor: "#d4d4d4", borderRadius: 3, padding: 7, position: "relative", flex: 1, flexDirection: "column" },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#0C6BA8",
    paddingBottom: 2,
    marginBottom: 4,
  },
  brandTitle: { fontSize: 11, fontWeight: "bold", color: "#0C6BA8" },
  brandLegal: { fontSize: 6.5, color: "#666" },
  docTitle: { fontSize: 13, fontWeight: "bold", textAlign: "center" },
  docTitleSecondary: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#555",
    textAlign: "center",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaCell: { flexDirection: "row", gap: 4 },
  metaLabel: { fontSize: 8, color: "#666" },
  metaLabelSecondary: { fontSize: 7, color: "#999" },
  metaValue: { fontSize: 9, fontWeight: "bold" },

  partyGrid: { flexDirection: "row", gap: 6, marginBottom: 4 },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 3,
    padding: 5,
  },
  partyHeader: { fontSize: 8, fontWeight: "bold", color: "#0C6BA8" },
  partyHeaderSecondary: {
    fontSize: 7,
    fontWeight: "normal",
    color: "#888",
    marginBottom: 3,
  },
  partyLine: { flexDirection: "row", marginBottom: 1 },
  partyLabel: { width: 56, fontSize: 7, color: "#888" },
  partyValue: { flex: 1, fontSize: 8, color: "#111" },

  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cccccc",
    marginTop: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  cIdx: { width: 20, fontSize: 8 },
  cModel: { flex: 1.6, fontSize: 8 },
  cSerial: { flex: 1, fontSize: 7 },
  cQty: { width: 28, textAlign: "right", fontSize: 8 },
  cUnit: { width: 72, textAlign: "right", fontSize: 8 },
  cTotal: { width: 88, textAlign: "right", fontSize: 8 },
  cHeadText: { fontSize: 7.5, fontWeight: "bold", color: "#222" },
  cHeadSec: { fontSize: 6.5, fontWeight: "normal", color: "#888" },

  totalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: "#0C6BA8",
    backgroundColor: "#F0F8FE",
  },
  totalLabel: { flex: 1, fontSize: 10, fontWeight: "bold", color: "#0C6BA8" },
  totalValue: { width: 110, textAlign: "right", fontSize: 12, fontWeight: "bold", color: "#0C6BA8" },

  payInfo: { marginTop: 4 },
  payRow: { flexDirection: "row", marginBottom: 2 },
  payLabel: { width: 100, fontSize: 8, color: "#666" },
  payLabelSec: { fontSize: 7, color: "#999" },
  payValue: { flex: 1, fontSize: 9, color: "#111" },

  notesBlock: { marginTop: 3, marginBottom: 3 },
  notesValue: { fontSize: 8, color: "#111" },

  signRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 16,
  },
  signBox: { flex: 1, alignItems: "center" },
  signSpace: { width: "100%", height: 22 },
  signLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#111",
    marginBottom: 3,
  },
  signLabel: { fontSize: 7, color: "#666", textAlign: "center" },
  signLabelSec: { fontSize: 6, color: "#999", textAlign: "center" },

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
  receiptNo: string;
  visitNo: string;
  contractNo: string;
  date: string;
  buyer: string;
  seller: string;
  name: string;
  customerCode: string;
  address: string;
  contact: string;
  phone: string;
  idx: string;
  model: string;
  serial: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  grandTotal: string;
  paymentMethod: string;
  notes: string;
  signCustomer: string;
  signTechnician: string;
  tearHere: string;
  methodCash: string;
  methodBank: string;
  methodCard: string;
  methodOther: string;
}

const LABELS: Record<DocLocale, LabelDict> = {
  vi: {
    title: "BIÊN LAI BÁN HÀNG (XUẤT KHO)",
    copyCustomer: "Bản khách hàng giữ",
    copyCompany: "Bản công ty giữ",
    receiptNo: "Số biên lai",
    visitNo: "Số phiếu",
    contractNo: "Số HĐ",
    date: "Ngày bán",
    buyer: "Người mua",
    seller: "Người bán",
    name: "Họ tên",
    customerCode: "Mã KH",
    address: "Địa chỉ",
    contact: "Liên hệ",
    phone: "Điện thoại",
    idx: "STT",
    model: "Mẫu mã",
    serial: "Số seri",
    qty: "SL",
    unitPrice: "Đơn giá",
    lineTotal: "Thành tiền",
    grandTotal: "Tổng cộng",
    paymentMethod: "Phương thức",
    notes: "Ghi chú",
    signCustomer: "Khách hàng ký",
    signTechnician: "KTV ký",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
    methodCash: "Tiền mặt",
    methodBank: "Chuyển khoản",
    methodCard: "Thẻ",
    methodOther: "Khác",
  },
  ko: {
    title: "판매 영수증 (출고서 겸용)",
    copyCustomer: "고객 보관용",
    copyCompany: "회사 보관용",
    receiptNo: "영수증 번호",
    visitNo: "방문 번호",
    contractNo: "계약 번호",
    date: "판매일",
    buyer: "구매자",
    seller: "판매자",
    name: "성명",
    customerCode: "고객코드",
    address: "주소",
    contact: "연락처",
    phone: "전화",
    idx: "순번",
    model: "모델",
    serial: "시리얼",
    qty: "수량",
    unitPrice: "단가",
    lineTotal: "금액",
    grandTotal: "총 합계",
    paymentMethod: "결제 방법",
    notes: "비고",
    signCustomer: "고객 서명",
    signTechnician: "기사 서명",
    tearHere: "이 선을 따라 자르세요",
    methodCash: "현금",
    methodBank: "은행 이체",
    methodCard: "카드",
    methodOther: "기타",
  },
  en: {
    title: "SALE RECEIPT (DELIVERY)",
    copyCustomer: "Customer copy",
    copyCompany: "Company copy",
    receiptNo: "Receipt no.",
    visitNo: "Slip no.",
    contractNo: "Contract no.",
    date: "Sale date",
    buyer: "Buyer",
    seller: "Seller",
    name: "Name",
    customerCode: "Code",
    address: "Address",
    contact: "Contact",
    phone: "Phone",
    idx: "#",
    model: "Model",
    serial: "Serial",
    qty: "Qty",
    unitPrice: "Unit price",
    lineTotal: "Amount",
    grandTotal: "Grand total",
    paymentMethod: "Payment",
    notes: "Notes",
    signCustomer: "Customer signature",
    signTechnician: "Technician signature",
    tearHere: "CUT ALONG THIS LINE",
    methodCash: "Cash",
    methodBank: "Bank transfer",
    methodCard: "Card",
    methodOther: "Other",
  },
};

function formatVnd(n: number): string {
  if (!Number.isFinite(n)) return "0 ₫";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function formatDate(d: Date): string {
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pickMethodKey(m: string): keyof Pick<LabelDict, "methodCash" | "methodBank" | "methodCard" | "methodOther"> {
  switch (m.toUpperCase()) {
    case "CASH":
      return "methodCash";
    case "BANK_TRANSFER":
      return "methodBank";
    case "CARD":
      return "methodCard";
    default:
      return "methodOther";
  }
}

function CopyBlock({
  payload,
  P,
  S,
  grandTotal,
  copyLabel,
}: Readonly<{
  payload: SaleReceiptPayload;
  P: LabelDict;
  S: LabelDict;
  grandTotal: number;
  copyLabel: string;
}>) {
  const methodKey = pickMethodKey(payload.paymentMethod);
  return (
    <View style={styles.copy}>
      <View style={styles.watermark}>
        <Image src={WATERMARK_LOGO_PATH} style={styles.watermarkImage} />
      </View>
      <View style={styles.brand}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flex: 1 }}>
          <Text style={styles.brandTitle}>SEOUL AQUA </Text>
          <Text style={styles.brandLegal}>· CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)</Text>
        </View>
        <Text style={styles.brandLegal}>cs@seoulaqua.com.vn · {payload.hqPhone}</Text>
      </View>

      <Text style={[styles.docTitle, autoFont(P.title)]}>{P.title}</Text>
      <Text style={[styles.docTitleSecondary, autoFont(S.title)]}>
        {S.title} · {copyLabel}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.receiptNo}:`}
            secondary={S.receiptNo}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={styles.metaValue}>{payload.receiptNumber}</Text>
        </View>
        {payload.contractNumber && (
          <View style={styles.metaCell}>
            <Bi
              primary={`${P.contractNo}:`}
              secondary={S.contractNo}
              style={styles.metaLabel}
              subStyle={styles.metaLabelSecondary}
            />
            <Text style={styles.metaValue}>{payload.contractNumber}</Text>
          </View>
        )}
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.date}:`}
            secondary={S.date}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={styles.metaValue}>{formatDate(payload.saleDate)}</Text>
        </View>
      </View>

      <View style={styles.partyGrid}>
        <View style={styles.partyBox}>
          <Text style={[styles.partyHeader, autoFont(P.buyer)]}>{P.buyer}</Text>
          <Text style={[styles.partyHeaderSecondary, autoFont(S.buyer)]}>{S.buyer}</Text>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.name}</Text>
            <Text style={[styles.partyValue, autoFont(payload.customerName)]}>
              {payload.customerName}
            </Text>
          </View>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.customerCode}</Text>
            <Text style={styles.partyValue}>{payload.customerCode}</Text>
          </View>
          {payload.address && (
            <View style={styles.partyLine}>
              <Text style={styles.partyLabel}>{P.address}</Text>
              <Text style={[styles.partyValue, autoFont(payload.address)]}>
                {payload.address}
              </Text>
            </View>
          )}
          {payload.contactName && (
            <View style={styles.partyLine}>
              <Text style={styles.partyLabel}>{P.contact}</Text>
              <Text style={[styles.partyValue, autoFont(payload.contactName)]}>
                {payload.contactName}
                {payload.contactPhone ? ` · ${payload.contactPhone}` : ""}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.partyBox}>
          <Text style={[styles.partyHeader, autoFont(P.seller)]}>{P.seller}</Text>
          <Text style={[styles.partyHeaderSecondary, autoFont(S.seller)]}>{S.seller}</Text>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.name}</Text>
            <Text style={styles.partyValue}>SEOUL AQUA</Text>
          </View>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.contact}</Text>
            <Text style={[styles.partyValue, autoFont(payload.technicianName)]}>
              {payload.technicianName}
            </Text>
          </View>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.phone}</Text>
            <Text style={styles.partyValue}>{payload.hqPhone}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tableHead}>
        <Text style={[styles.cIdx, styles.cHeadText]}>{P.idx}</Text>
        <Text style={[styles.cModel, styles.cHeadText]}>
          {P.model}
          {"\n"}
          <Text style={[styles.cHeadSec, autoFont(S.model)]}>{S.model}</Text>
        </Text>
        <Text style={[styles.cSerial, styles.cHeadText]}>
          {P.serial}
          {"\n"}
          <Text style={[styles.cHeadSec, autoFont(S.serial)]}>{S.serial}</Text>
        </Text>
        <Text style={[styles.cQty, styles.cHeadText]}>{P.qty}</Text>
        <Text style={[styles.cUnit, styles.cHeadText]}>{P.unitPrice}</Text>
        <Text style={[styles.cTotal, styles.cHeadText]}>{P.lineTotal}</Text>
      </View>
      {payload.lines.map((l, idx) => {
        const total = l.unitPrice * l.quantity;
        return (
          <View key={`${l.modelCode}-${idx}`} style={styles.tableRow}>
            <Text style={styles.cIdx}>{idx + 1}</Text>
            <Text style={styles.cModel}>
              {l.modelCode}
              {"\n"}
              <Text style={{ color: "#666", fontSize: 7 }}>{l.modelName}</Text>
            </Text>
            <Text style={styles.cSerial}>{l.serialNumber ?? "—"}</Text>
            <Text style={styles.cQty}>{l.quantity}</Text>
            <Text style={styles.cUnit}>{formatVnd(l.unitPrice)}</Text>
            <Text style={styles.cTotal}>{formatVnd(total)}</Text>
          </View>
        );
      })}
      <View style={styles.totalRow}>
        <Bi
          primary={P.grandTotal}
          secondary={S.grandTotal}
          style={styles.totalLabel}
          subStyle={{ fontSize: 7, fontWeight: "normal", color: "#6AA4C8" }}
        />
        <Text style={styles.totalValue}>{formatVnd(grandTotal)}</Text>
      </View>

      <View style={styles.payInfo}>
        <View style={styles.payRow}>
          <Bi
            primary={`${P.paymentMethod}:`}
            secondary={S.paymentMethod}
            style={styles.payLabel}
            subStyle={styles.payLabelSec}
          />
          <Text style={[styles.payValue, autoFont(`${P[methodKey]}${S[methodKey]}`)]}>
            {P[methodKey]} / {S[methodKey]}
          </Text>
        </View>
        {payload.notes && (
          <View style={styles.payRow}>
            <Bi
              primary={`${P.notes}:`}
              secondary={S.notes}
              style={styles.payLabel}
              subStyle={styles.payLabelSec}
            />
            <Text style={[styles.notesValue, autoFont(payload.notes)]}>
              {payload.notes}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flexGrow: 1 }} />
      <View style={styles.signRow}>
        <View style={styles.signBox}>
          <View style={styles.signSpace} />
          <View style={styles.signLine} />
          <Text style={[styles.signLabel, autoFont(P.signCustomer)]}>
            {P.signCustomer}
          </Text>
          <Text style={[styles.signLabelSec, autoFont(S.signCustomer)]}>
            {S.signCustomer}
          </Text>
        </View>
        <View style={styles.signBox}>
          <View style={styles.signSpace} />
          <View style={styles.signLine} />
          <Text style={[styles.signLabel, autoFont(P.signTechnician)]}>
            {P.signTechnician}
          </Text>
          <Text style={[styles.signLabelSec, autoFont(S.signTechnician)]}>
            {S.signTechnician}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function SaleReceiptB2C({ payload }: Readonly<{ payload: SaleReceiptPayload }>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const grandTotal = payload.lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0);
  const tearText = `${P.tearHere} ✂ ${S.tearHere}`;
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={false}>
        <CopyBlock payload={payload} P={P} S={S} grandTotal={grandTotal} copyLabel={P.copyCustomer} />
        <View style={styles.tearWrap} wrap={false}>
          <View style={styles.tearDash} />
          <Text style={[styles.tearText, autoFont(tearText)]}>{tearText}</Text>
          <View style={styles.tearDash} />
        </View>
        <CopyBlock payload={payload} P={P} S={S} grandTotal={grandTotal} copyLabel={P.copyCompany} />
      </Page>
    </Document>
  );
}
