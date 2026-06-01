/**
 * Receipt PDF (DOCUMENT_TEMPLATES.md #5).
 *
 * A4 한 장에 동일 영수증 2부 (상단 = Payer/고객 보관용, 하단 = Payee/회사 보관용)
 * + 가운데 절취선. 두 부의 내용은 동일.
 *
 * 각 부 안에서 지급인(Payer) / 수취인(Payee) 정보를 2-column grid 로 명시.
 * 결제방법은 자연어 + 언어 병기 (CASH → 현금 / Tiền mặt 등).
 *
 * taxCode + reference 컬럼은 영수증에서 제거 (사용자 요청 2026-06-01).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { Bi } from "./shared";
import { splitLangPair, type PdfLangPair } from "@/lib/pdf/types";
import { PDF_DEFAULT_FAMILY, PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

// Inline Hangul detector — picks Noto Sans KR for KO data values; default
// Be Vietnam Pro handles VI diacritics + Latin out of the box.
const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;
function autoFont(s: string | null | undefined) {
  return s && HANGUL_RE.test(s)
    ? { fontFamily: PDF_FONT_FAMILY.ko }
    : { fontFamily: PDF_DEFAULT_FAMILY };
}

export type ReceiptLocale = "ko" | "vi" | "en";

export interface ReceiptPayload {
  receiptNumber: string;
  paymentId: string;
  customerName: string;
  customerCode: string;
  customerType: "B2C" | "B2B";
  /** Kept on the payload for backward-compat; no longer rendered. */
  taxCode: string | null;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  collectedAt: Date;
  collectorName: string;
  /** PaymentMethod enum value — rendered as bilingual natural language. */
  method: string;
  expectedAmount: number;
  actualAmount: number;
  carryoverAmount: number;
  /** Kept on the payload for backward-compat; no longer rendered. */
  reference: string | null;
  notes: string | null;
  hqPhone: string;
  langPair: PdfLangPair;
  generatedAt: Date;
}

const SHEET_PAD = 24;
const COPY_GAP = 12; // 두 부 사이 절취 영역 높이

const styles = StyleSheet.create({
  page: {
    padding: SHEET_PAD,
    fontSize: 9,
    fontFamily: PDF_DEFAULT_FAMILY,
    color: "#111",
  },

  // 한 부 (영수증 1장)
  copy: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 4,
    padding: 10,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#0C6BA8",
    paddingBottom: 3,
    marginBottom: 4,
  },
  brandTitle: { fontSize: 12, fontWeight: "bold", color: "#0C6BA8" },
  brandLegal: { fontSize: 7, color: "#666" },

  docTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
  },
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

  // 2-column Payer/Payee grid
  partyGrid: { flexDirection: "row", gap: 6, marginBottom: 4 },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 3,
    padding: 5,
  },
  partyHeader: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#0C6BA8",
    marginBottom: 1,
  },
  partyHeaderSecondary: {
    fontSize: 7,
    fontWeight: "normal",
    color: "#888",
    marginBottom: 3,
  },
  partyLine: { flexDirection: "row", marginBottom: 1 },
  partyLabel: { width: 52, fontSize: 7, color: "#888" },
  partyValue: { flex: 1, fontSize: 8, color: "#111" },

  // 결제 정보 + 금액
  payInfo: { marginBottom: 4 },
  payRow: { flexDirection: "row", marginBottom: 2 },
  payLabel: { width: 110, fontSize: 8, color: "#666" },
  payLabelSecondary: { fontSize: 7, color: "#999" },
  payValue: { flex: 1, fontSize: 9, color: "#111" },


  amountBox: {
    marginTop: 3,
    padding: 6,
    borderWidth: 1.5,
    borderColor: "#0C6BA8",
    borderRadius: 3,
    backgroundColor: "#F0F8FE",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: { fontSize: 8, color: "#525252" },
  amountLabelSecondary: { fontSize: 7, color: "#8A8A8A" },
  amountValue: { fontSize: 15, fontWeight: "bold", color: "#0C6BA8" },
  // 현장 손기입 영역 — 빈 underline + ₫ 단위만
  amountFill: {
    flex: 1,
    marginLeft: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  amountFillLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#0C6BA8",
    height: 22,
  },
  amountUnit: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#0C6BA8",
    paddingBottom: 1,
  },
  carryover: {
    marginTop: 3,
    color: "#B45309",
    fontSize: 8,
    fontWeight: "bold",
  },

  // 서명 영역 — 실제 서명을 위한 충분한 공간 확보
  signRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 16,
  },
  signBox: {
    flex: 1,
    alignItems: "center",
  },
  signSpace: {
    width: "100%",
    height: 44, // 실제 서명할 빈 공간
  },
  signLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#111",
    marginBottom: 3,
  },
  signLabel: { fontSize: 7, color: "#666", textAlign: "center" },
  signLabelSecondary: { fontSize: 6, color: "#999", textAlign: "center" },

  // 가운데 절취선 (두 부 사이)
  tearWrap: {
    height: COPY_GAP,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  tearText: {
    fontSize: 7,
    color: "#999",
    marginHorizontal: 6,
  },
  tearDash: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#999",
    borderBottomStyle: "dashed",
  },
});

interface LabelDict {
  title: string;
  receiptNo: string;
  date: string;
  payer: string;
  payee: string;
  name: string;
  customerCode: string;
  address: string;
  contact: string;
  company: string;
  collector: string;
  phone: string;
  email: string;
  method: string;
  expected: string;
  amountReceived: string;
  carryover: string;
  notes: string;
  signedPayer: string;
  signedPayee: string;
  tearHere: string;
  // 결제방법 자연어
  methodCash: string;
  methodBankTransfer: string;
  methodCard: string;
  methodOther: string;
}

const LABELS: Record<ReceiptLocale, LabelDict> = {
  vi: {
    title: "HÓA ĐƠN (BIÊN LAI THU TIỀN)",
    receiptNo: "Số biên lai",
    date: "Ngày thu",
    payer: "Người trả tiền",
    payee: "Người nhận tiền",
    name: "Họ tên",
    customerCode: "Mã KH",
    address: "Địa chỉ",
    contact: "Liên hệ",
    company: "Công ty",
    collector: "Người thu",
    phone: "Điện thoại",
    email: "Email",
    method: "Phương thức",
    expected: "Số tiền dự kiến",
    amountReceived: "Số tiền thu",
    carryover: "Còn nợ (chuyển kỳ sau)",
    notes: "Ghi chú",
    signedPayer: "Người trả tiền ký",
    signedPayee: "Người thu ký",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
    methodCash: "Tiền mặt",
    methodBankTransfer: "Chuyển khoản",
    methodCard: "Thẻ",
    methodOther: "Khác",
  },
  ko: {
    title: "영수증 (수금 확인서)",
    receiptNo: "영수증 번호",
    date: "수금일",
    payer: "지급인",
    payee: "수취인",
    name: "성명",
    customerCode: "고객코드",
    address: "주소",
    contact: "연락처",
    company: "회사",
    collector: "수금자",
    phone: "전화",
    email: "이메일",
    method: "결제방법",
    expected: "예상 금액",
    amountReceived: "수금 금액",
    carryover: "잔여 (다음 차수 이월)",
    notes: "비고",
    signedPayer: "지급인 서명",
    signedPayee: "수취인 서명",
    tearHere: "이 선을 따라 자르세요",
    methodCash: "현금",
    methodBankTransfer: "은행 이체",
    methodCard: "카드",
    methodOther: "기타",
  },
  en: {
    title: "RECEIPT (CASH COLLECTION)",
    receiptNo: "Receipt no.",
    date: "Date",
    payer: "Payer",
    payee: "Payee",
    name: "Name",
    customerCode: "Code",
    address: "Address",
    contact: "Contact",
    company: "Company",
    collector: "Collected by",
    phone: "Phone",
    email: "Email",
    method: "Method",
    expected: "Expected",
    amountReceived: "Amount received",
    carryover: "Carryover (next cycle)",
    notes: "Notes",
    signedPayer: "Payer signature",
    signedPayee: "Collector signature",
    tearHere: "CUT ALONG THIS LINE",
    methodCash: "Cash",
    methodBankTransfer: "Bank transfer",
    methodCard: "Card",
    methodOther: "Other",
  },
};

function formatVnd(n: number): string {
  if (!Number.isFinite(n)) return "0 ₫";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function formatDateTime(d: Date): string {
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x));
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function pickMethodKey(method: string): keyof Pick<LabelDict, "methodCash" | "methodBankTransfer" | "methodCard" | "methodOther"> {
  switch (method.toUpperCase()) {
    case "CASH":
      return "methodCash";
    case "BANK_TRANSFER":
      return "methodBankTransfer";
    case "CARD":
      return "methodCard";
    default:
      return "methodOther";
  }
}

interface ReceiptProps {
  payload: ReceiptPayload;
}

/** 영수증 한 부 (두 부가 같은 내용) */
function ReceiptCopy({
  payload,
  P,
  S,
}: Readonly<{
  payload: ReceiptPayload;
  P: LabelDict;
  S: LabelDict;
}>) {
  const methodKey = pickMethodKey(payload.method);
  const methodPrimary = P[methodKey];
  const methodSecondary = S[methodKey];

  return (
    <View style={styles.copy}>
      {/* 브랜드 헤더 */}
      <View style={styles.brand}>
        <View>
          <Text style={styles.brandTitle}>SEOUL AQUA</Text>
          <Text style={styles.brandLegal}>
            CÔNG TY TNHH MTV TM&DV ĐẠI Á
          </Text>
        </View>
        <View>
          <Text style={styles.brandLegal}>cs@seoulaqua.com.vn</Text>
          <Text style={styles.brandLegal}>{payload.hqPhone}</Text>
        </View>
      </View>

      <Text style={[styles.docTitle, autoFont(P.title)]}>{P.title}</Text>
      <Text style={[styles.docTitleSecondary, autoFont(S.title)]}>{S.title}</Text>

      {/* meta — 영수증 번호 + 수금일 */}
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
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.date}:`}
            secondary={S.date}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={styles.metaValue}>{formatDateTime(payload.collectedAt)}</Text>
        </View>
      </View>

      {/* 2-column Payer/Payee */}
      <View style={styles.partyGrid}>
        {/* Payer */}
        <View style={styles.partyBox}>
          <Text style={[styles.partyHeader, autoFont(P.payer)]}>{P.payer}</Text>
          <Text style={[styles.partyHeaderSecondary, autoFont(S.payer)]}>{S.payer}</Text>

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
          {payload.address ? (
            <View style={styles.partyLine}>
              <Text style={styles.partyLabel}>{P.address}</Text>
              <Text style={[styles.partyValue, autoFont(payload.address)]}>
                {payload.address}
              </Text>
            </View>
          ) : null}
          {payload.contactName ? (
            <View style={styles.partyLine}>
              <Text style={styles.partyLabel}>{P.contact}</Text>
              <Text style={[styles.partyValue, autoFont(payload.contactName)]}>
                {payload.contactName}
                {payload.contactPhone ? ` · ${payload.contactPhone}` : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Payee */}
        <View style={styles.partyBox}>
          <Text style={[styles.partyHeader, autoFont(P.payee)]}>{P.payee}</Text>
          <Text style={[styles.partyHeaderSecondary, autoFont(S.payee)]}>{S.payee}</Text>

          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.company}</Text>
            <Text style={styles.partyValue}>SEOUL AQUA</Text>
          </View>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.collector}</Text>
            <Text style={[styles.partyValue, autoFont(payload.collectorName)]}>
              {payload.collectorName}
            </Text>
          </View>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.phone}</Text>
            <Text style={styles.partyValue}>{payload.hqPhone}</Text>
          </View>
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.email}</Text>
            <Text style={styles.partyValue}>cs@seoulaqua.com.vn</Text>
          </View>
        </View>
      </View>

      {/* 결제 정보 — 비고가 결제방법 위에 옴 */}
      <View style={styles.payInfo}>
        {payload.notes ? (
          <View style={styles.payRow}>
            <Bi
              primary={`${P.notes}:`}
              secondary={S.notes}
              style={styles.payLabel}
              subStyle={styles.payLabelSecondary}
            />
            <Text style={[styles.payValue, autoFont(payload.notes)]}>
              {payload.notes}
            </Text>
          </View>
        ) : null}
        <View style={styles.payRow}>
          <Bi
            primary={`${P.method}:`}
            secondary={S.method}
            style={styles.payLabel}
            subStyle={styles.payLabelSecondary}
          />
          <Text
            style={[
              styles.payValue,
              autoFont(`${methodPrimary}${methodSecondary}`),
            ]}
          >
            {methodPrimary} / {methodSecondary}
          </Text>
        </View>
        <View style={styles.payRow}>
          <Bi
            primary={`${P.expected}:`}
            secondary={S.expected}
            style={styles.payLabel}
            subStyle={styles.payLabelSecondary}
          />
          <Text style={styles.payValue}>{formatVnd(payload.expectedAmount)}</Text>
        </View>
      </View>

      {/* 금액 박스 — 기사가 현장에서 손으로 기입할 빈 공간 + ₫ */}
      <View style={styles.amountBox}>
        <View>
          <Text style={[styles.amountLabel, autoFont(P.amountReceived)]}>
            {P.amountReceived}
          </Text>
          <Text
            style={[styles.amountLabelSecondary, autoFont(S.amountReceived)]}
          >
            {S.amountReceived}
          </Text>
        </View>
        <View style={styles.amountFill}>
          <View style={styles.amountFillLine} />
          <Text style={styles.amountUnit}>₫</Text>
        </View>
      </View>

      {payload.carryoverAmount > 0 ? (
        <Text
          style={[
            styles.carryover,
            autoFont(`${P.carryover}${S.carryover}`),
          ]}
        >
          {P.carryover} / {S.carryover}: {formatVnd(payload.carryoverAmount)}
        </Text>
      ) : null}

      {/* 서명 — 위쪽 빈 공간 + 서명선 + 라벨 */}
      <View style={styles.signRow}>
        <View style={styles.signBox}>
          <View style={styles.signSpace} />
          <View style={styles.signLine} />
          <Text style={[styles.signLabel, autoFont(P.signedPayer)]}>
            {P.signedPayer}
          </Text>
          <Text style={[styles.signLabelSecondary, autoFont(S.signedPayer)]}>
            {S.signedPayer}
          </Text>
        </View>
        <View style={styles.signBox}>
          <View style={styles.signSpace} />
          <View style={styles.signLine} />
          <Text style={[styles.signLabel, autoFont(P.signedPayee)]}>
            {P.signedPayee}
          </Text>
          <Text style={[styles.signLabelSecondary, autoFont(S.signedPayee)]}>
            {S.signedPayee}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function Receipt({ payload }: Readonly<ReceiptProps>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const tearText = `${P.tearHere} ✂ ${S.tearHere}`;

  return (
    <Document>
      {/* wrap={false} 로 A4 한 장 강제 — 컨텐츠가 넘쳐도 페이지 추가 없음 */}
      <Page size="A4" style={styles.page} wrap={false}>
        {/* 첫 번째 부 — 고객(Payer) 보관용 */}
        <ReceiptCopy payload={payload} P={P} S={S} />

        {/* 절취선 */}
        <View style={styles.tearWrap} wrap={false}>
          <View style={styles.tearDash} />
          <Text style={[styles.tearText, autoFont(tearText)]}>{tearText}</Text>
          <View style={styles.tearDash} />
        </View>

        {/* 두 번째 부 — 회사(Payee) 보관용 */}
        <ReceiptCopy payload={payload} P={P} S={S} />
      </Page>
    </Document>
  );
}
