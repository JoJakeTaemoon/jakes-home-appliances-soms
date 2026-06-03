/**
 * Delivery + Receipt PDF (B2C RENTAL install — DOCUMENT_TEMPLATES.md §4).
 *
 * 임대 설치 + 인수증 겸용. A4 한 장에 동일 내용 2부 (상단 = 고객 보관용,
 * 하단 = 회사 보관용) + 가운데 절취선. 두 부의 내용은 동일.
 *
 * 핵심 데이터:
 *   - 고객(B2C) — 이름·코드·주소·연락처
 *   - 계약 — 번호 + 기간(시작~종료) + 월 임대료
 *   - 장비 — model + serial (보통 1대, 여러대도 지원)
 *   - 인수 일시 — visit.scheduledFor (실제 설치 일)
 *   - 기사 이름
 *   - 고객 서명란 + 기사 서명란
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

export type DocLocale = "ko" | "vi" | "en";

export interface DeliveryReceiptEquipmentLine {
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
}

export interface DeliveryReceiptPayload {
  visitNumber: string;
  contractNumber: string;
  customerName: string;
  customerCode: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  installedAt: Date;
  technicianName: string;
  equipment: DeliveryReceiptEquipmentLine[];
  notes: string | null;
  hqPhone: string;
  langPair: PdfLangPair;
  generatedAt: Date;
}

const SHEET_PAD = 22;
const COPY_GAP = 12;

const styles = StyleSheet.create({
  page: {
    padding: 14,
    fontSize: 9,
    fontFamily: PDF_DEFAULT_FAMILY,
    color: "#111",
  },
  copy: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 4,
    padding: 10,
    position: "relative",
  },
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
  partyLabel: { width: 60, fontSize: 7, color: "#888" },
  partyValue: { flex: 1, fontSize: 8, color: "#111" },

  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cccccc",
    marginTop: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  cIdx: { width: 22, fontSize: 8 },
  cModel: { flex: 1.6, fontSize: 8 },
  cSerial: { flex: 1, fontSize: 8 },
  cHeadText: { fontSize: 7.5, fontWeight: "bold", color: "#222" },
  cHeadSec: { fontSize: 6.5, fontWeight: "normal", color: "#888" },

  notesBlock: { marginTop: 4, marginBottom: 4 },
  notesLabel: { fontSize: 8, color: "#666" },
  notesValue: { fontSize: 8, color: "#111", marginTop: 1 },

  signRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 16,
  },
  signBox: { flex: 1, alignItems: "center" },
  signSpace: { width: "100%", height: 24 },
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
  visitNo: string;
  date: string;
  contractNo: string;
  customer: string;
  company: string;
  name: string;
  customerCode: string;
  address: string;
  contact: string;
  phone: string;
  equipment: string;
  idx: string;
  model: string;
  serial: string;
  notes: string;
  signCustomer: string;
  signTechnician: string;
  tearHere: string;
}

const LABELS: Record<DocLocale, LabelDict> = {
  vi: {
    title: "BIÊN BẢN BÀN GIAO & BIÊN LAI",
    copyCustomer: "Bản khách hàng giữ",
    copyCompany: "Bản công ty giữ",
    visitNo: "Số phiếu",
    date: "Ngày bàn giao",
    contractNo: "Số hợp đồng",
    customer: "Khách hàng (Bên nhận)",
    company: "Công ty (Bên giao)",
    name: "Họ tên",
    customerCode: "Mã KH",
    address: "Địa chỉ",
    contact: "Liên hệ",
    phone: "Điện thoại",
    equipment: "Danh sách thiết bị bàn giao",
    idx: "STT",
    model: "Model",
    serial: "Số seri",
    notes: "Ghi chú",
    signCustomer: "Khách hàng ký nhận",
    signTechnician: "KTV bàn giao ký",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
  },
  ko: {
    title: "장비 인수증 (임대 설치 + 인수 확인)",
    copyCustomer: "고객 보관용",
    copyCompany: "회사 보관용",
    visitNo: "방문 번호",
    date: "인수일",
    contractNo: "계약 번호",
    customer: "고객 (인수자)",
    company: "회사 (인계자)",
    name: "성명",
    customerCode: "고객코드",
    address: "주소",
    contact: "연락처",
    phone: "전화",
    equipment: "인수 장비 목록",
    idx: "순번",
    model: "모델",
    serial: "시리얼",
    notes: "비고",
    signCustomer: "고객 서명",
    signTechnician: "기사 서명",
    tearHere: "이 선을 따라 자르세요",
  },
  en: {
    title: "DELIVERY & ACKNOWLEDGEMENT",
    copyCustomer: "Customer copy",
    copyCompany: "Company copy",
    visitNo: "Slip no.",
    date: "Delivery date",
    contractNo: "Contract no.",
    customer: "Customer (Recipient)",
    company: "Company (Deliverer)",
    name: "Name",
    customerCode: "Code",
    address: "Address",
    contact: "Contact",
    phone: "Phone",
    equipment: "Delivered equipment",
    idx: "#",
    model: "Model",
    serial: "Serial",
    notes: "Notes",
    signCustomer: "Customer signature",
    signTechnician: "Technician signature",
    tearHere: "CUT ALONG THIS LINE",
  },
};

function formatDateTime(d: Date): string {
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CopyBlock({
  payload,
  P,
  S,
  copyLabel,
}: Readonly<{
  payload: DeliveryReceiptPayload;
  P: LabelDict;
  S: LabelDict;
  copyLabel: string;
}>) {
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
            primary={`${P.visitNo}:`}
            secondary={S.visitNo}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={styles.metaValue}>{payload.visitNumber}</Text>
        </View>
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.contractNo}:`}
            secondary={S.contractNo}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={styles.metaValue}>{payload.contractNumber}</Text>
        </View>
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.date}:`}
            secondary={S.date}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={styles.metaValue}>{formatDateTime(payload.installedAt)}</Text>
        </View>
      </View>

      <View style={styles.partyGrid}>
        <View style={styles.partyBox}>
          <Text style={[styles.partyHeader, autoFont(P.customer)]}>{P.customer}</Text>
          <Text style={[styles.partyHeaderSecondary, autoFont(S.customer)]}>
            {S.customer}
          </Text>
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
          <Text style={[styles.partyHeader, autoFont(P.company)]}>{P.company}</Text>
          <Text style={[styles.partyHeaderSecondary, autoFont(S.company)]}>
            {S.company}
          </Text>
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

      <View style={{ marginTop: 2, flexDirection: "row", alignItems: "baseline", gap: 4 }}>
        <Text style={[{ fontSize: 9, fontWeight: "bold", color: "#0C6BA8" }, autoFont(P.equipment)]}>
          {P.equipment}
        </Text>
        <Text style={[{ fontSize: 7.5, color: "#6AA4C8" }, autoFont(S.equipment)]}>
          / {S.equipment}
        </Text>
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
      </View>
      {payload.equipment.map((e, idx) => (
        <View key={`${e.modelCode}-${idx}`} style={styles.tableRow}>
          <Text style={styles.cIdx}>{idx + 1}</Text>
          <Text style={styles.cModel}>
            {e.modelCode}
            {"\n"}
            <Text style={{ color: "#666", fontSize: 7 }}>{e.modelName}</Text>
          </Text>
          <Text style={styles.cSerial}>{e.serialNumber ?? "—"}</Text>
        </View>
      ))}

      {payload.notes && (
        <View style={styles.notesBlock}>
          <Bi
            primary={P.notes}
            secondary={S.notes}
            style={styles.notesLabel}
            subStyle={styles.metaLabelSecondary}
          />
          <Text style={[styles.notesValue, autoFont(payload.notes)]}>
            {payload.notes}
          </Text>
        </View>
      )}

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

export function DeliveryReceipt({ payload }: Readonly<{ payload: DeliveryReceiptPayload }>) {
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
