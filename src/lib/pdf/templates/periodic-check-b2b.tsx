/**
 * B2B Periodic Check Confirmation PDF (DOCUMENT_TEMPLATES.md §7).
 *
 * B2B 정기 점검 확인서 — **가격 없음** (B2B 청구는 별도 세금계산서로 진행).
 * 사이트별 다중 장비 표 + 작업 내용 + 서명.
 *
 * 페이지 정책:
 *  - 장비 ≤4개: A4 1장에 고객 보관용 + 회사 보관용 두 부 (절취선).
 *  - 장비 5~10개: A4 1장 = 고객 보관용 / A4 1장 = 회사 보관용 (총 2장).
 *  - 장비 11개 이상은 추후 분할 정책 follow-up (현재는 page-overflow 허용).
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
  "jakes-home-appliances-logo.jpg",
);

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;
function autoFont(s: string | null | undefined) {
  return s && HANGUL_RE.test(s)
    ? { fontFamily: PDF_FONT_FAMILY.ko }
    : { fontFamily: PDF_DEFAULT_FAMILY };
}

type DocLocale = "ko" | "vi" | "en";

export interface PeriodicCheckB2bEquipmentLine {
  modelCode: string;
  modelName: string;
  serialNumber: string | null;
  location: string | null; // site name or sub-location
  workSummary: string; // e.g. "Vệ sinh + thay lõi Sediment"
  notes: string | null;
}

export interface PeriodicCheckB2bPayload {
  visitNumber: string;
  customerName: string;
  customerCode: string;
  customerTaxCode: string | null;
  customerAddress: string;
  siteName: string | null;
  siteAddress: string | null;
  recipientName: string | null;
  recipientTitle: string | null;
  visitDate: Date;
  technicianName: string;
  collaboratorNames: string[];
  equipment: PeriodicCheckB2bEquipmentLine[];
  generalNotes: string | null;
  hqPhone: string;
  langPair: PdfLangPair;
  generatedAt: Date;
}

const SHEET_PAD = 22;
const COPY_GAP = 12;
// 5개 이상이면 2장(각 1부); 4개 이하면 1장(2부).
const SINGLE_PAGE_THRESHOLD = 4;

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
  docTitleSec: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#555",
    textAlign: "center",
    marginBottom: 4,
  },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  metaCell: { flexDirection: "row", gap: 4 },
  metaLabel: { fontSize: 8, color: "#666" },
  metaLabelSec: { fontSize: 7, color: "#999" },
  metaValue: { fontSize: 9, fontWeight: "bold" },

  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 3,
    padding: 4,
    marginBottom: 3,
  },
  sectionTitle: { fontSize: 8.5, fontWeight: "bold", color: "#0C6BA8" },
  sectionTitleSec: { fontSize: 7, fontWeight: "normal", color: "#6AA4C8", marginBottom: 2 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 1,
    marginBottom: 2,
  },
  sectionTitleP: { fontSize: 8.5, fontWeight: "bold", color: "#0C6BA8" },
  sectionTitleS: { fontSize: 7, color: "#6AA4C8" },

  partyLine: { flexDirection: "row", marginBottom: 0.5 },
  partyLabel: { width: 60, fontSize: 6.8, color: "#888" },
  partyValue: { flex: 1, fontSize: 7.5, color: "#111" },

  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderTopWidth: 0.7,
    borderBottomWidth: 0.7,
    borderColor: "#bbb",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  cIdx: { width: 16, fontSize: 7 },
  cLoc: { width: 60, fontSize: 7 },
  cModel: { flex: 1.4, fontSize: 7, paddingRight: 2 },
  cSerial: { width: 60, fontSize: 6.8 },
  cWork: { flex: 1.6, fontSize: 7, paddingRight: 2 },
  cNotes: { flex: 1, fontSize: 6.8 },
  cHeadText: { fontSize: 6.8, fontWeight: "bold", color: "#222" },
  cHeadSec: { fontSize: 6, fontWeight: "normal", color: "#888" },

  signRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 16,
  },
  signBox: { flex: 1, alignItems: "center" },
  signSpace: { width: "100%", height: 18 },
  signLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#111",
    marginBottom: 2,
  },
  signLabel: { fontSize: 7, color: "#666", textAlign: "center" },
  signLabelSec: { fontSize: 6, color: "#999", textAlign: "center" },
  signName: { fontSize: 7.5, fontWeight: "bold", marginTop: 1, textAlign: "center" },

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

  copyBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    fontSize: 7.5,
    color: "#0C6BA8",
    fontWeight: "bold",
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
  customer: string;
  name: string;
  customerCode: string;
  taxCode: string;
  address: string;
  site: string;
  recipient: string;
  technician: string;
  collaborators: string;
  equipmentList: string;
  idx: string;
  loc: string;
  model: string;
  serial: string;
  work: string;
  notes: string;
  signCustomer: string;
  signTechnician: string;
  noPriceNotice: string;
  tearHere: string;
}

const LABELS: Record<DocLocale, LabelDict> = {
  vi: {
    title: "PHIẾU XÁC NHẬN BẢO TRÌ ĐỊNH KỲ (B2B)",
    copyCustomer: "Bản khách hàng giữ",
    copyCompany: "Bản công ty giữ",
    visitNo: "Số phiếu",
    date: "Ngày thăm",
    customer: "Khách hàng",
    name: "Đơn vị",
    customerCode: "Mã KH",
    taxCode: "MST",
    address: "Địa chỉ",
    site: "Cơ sở",
    recipient: "Người nhận",
    technician: "KTV chính",
    collaborators: "KTV phụ",
    equipmentList: "Danh sách thiết bị bảo trì",
    idx: "STT",
    loc: "Vị trí",
    model: "Thiết bị",
    serial: "S/N",
    work: "Nội dung công việc",
    notes: "Ghi chú",
    signCustomer: "Đại diện khách hàng",
    signTechnician: "KTV phụ trách",
    noPriceNotice:
      "* Phí dịch vụ phát hành riêng qua hoá đơn GTGT.",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
  },
  ko: {
    title: "정기 점검 확인서 (B2B)",
    copyCustomer: "고객 보관용",
    copyCompany: "회사 보관용",
    visitNo: "방문 번호",
    date: "점검일",
    customer: "고객",
    name: "회사",
    customerCode: "고객코드",
    taxCode: "세금코드",
    address: "주소",
    site: "사이트",
    recipient: "수령자",
    technician: "주관 기사",
    collaborators: "협업 기사",
    equipmentList: "점검 장비 목록",
    idx: "순번",
    loc: "위치",
    model: "장비",
    serial: "S/N",
    work: "작업 내용",
    notes: "비고",
    signCustomer: "고객사 대표 서명",
    signTechnician: "기사 서명",
    noPriceNotice: "* 청구 금액은 별도 세금계산서로 발행됩니다.",
    tearHere: "이 선을 따라 자르세요",
  },
  en: {
    title: "PERIODIC CHECK CONFIRMATION (B2B)",
    copyCustomer: "Customer copy",
    copyCompany: "Company copy",
    visitNo: "Visit no.",
    date: "Visit date",
    customer: "Customer",
    name: "Company",
    customerCode: "Code",
    taxCode: "Tax code",
    address: "Address",
    site: "Site",
    recipient: "Recipient",
    technician: "Lead tech",
    collaborators: "Collaborators",
    equipmentList: "Inspected equipment",
    idx: "#",
    loc: "Location",
    model: "Equipment",
    serial: "S/N",
    work: "Work performed",
    notes: "Notes",
    signCustomer: "Customer representative",
    signTechnician: "Technician",
    noPriceNotice: "* Service fees are billed separately via a tax invoice.",
    tearHere: "CUT ALONG THIS LINE",
  },
};

function formatDate(d: Date): string {
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function CopyBlock({
  payload,
  P,
  S,
  copyLabel,
}: Readonly<{
  payload: PeriodicCheckB2bPayload;
  P: LabelDict;
  S: LabelDict;
  copyLabel: string;
}>) {
  return (
    <View style={styles.copy}>
      <View style={styles.watermark}>
        <Image src={WATERMARK_LOGO_PATH} style={styles.watermarkImage} />
      </View>
      <Text style={styles.copyBadge}>{copyLabel}</Text>
      <View style={styles.brand}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flex: 1 }}>
          <Text style={styles.brandTitle}>JAKE'S HOME APPLIANCES </Text>
          <Text style={styles.brandLegal}>· CÔNG TY TNHH MTV TM&DV JAKE'S HA (Jake's Home Appliances)</Text>
        </View>
        <Text style={styles.brandLegal}>cs@jakeshomeappliances.com.vn · {payload.hqPhone}</Text>
      </View>

      <Text style={[styles.docTitle, autoFont(P.title)]}>{P.title}</Text>
      <Text style={[styles.docTitleSec, autoFont(S.title)]}>{S.title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.visitNo}:`}
            secondary={S.visitNo}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={styles.metaValue}>{payload.visitNumber}</Text>
        </View>
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.date}:`}
            secondary={S.date}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={styles.metaValue}>{formatDate(payload.visitDate)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Bi
            primary={`${P.technician}:`}
            secondary={S.technician}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.metaValue, autoFont(payload.technicianName)]}>
            {payload.technicianName}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitleP, autoFont(P.customer)]}>{P.customer}</Text>
          <Text style={[styles.sectionTitleS, autoFont(S.customer)]}> / {S.customer}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={[styles.partyLine, { flex: 1 }]}>
            <Text style={styles.partyLabel}>{P.name}</Text>
            <Text style={[styles.partyValue, autoFont(payload.customerName)]}>
              {payload.customerName} ({payload.customerCode})
            </Text>
          </View>
          {payload.customerTaxCode && (
            <View style={[styles.partyLine, { flex: 1 }]}>
              <Text style={styles.partyLabel}>{P.taxCode}</Text>
              <Text style={styles.partyValue}>{payload.customerTaxCode}</Text>
            </View>
          )}
        </View>
        {payload.siteName && (
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.site}</Text>
            <Text style={[styles.partyValue, autoFont(payload.siteName)]}>
              {payload.siteName}
              {payload.siteAddress ? ` — ${payload.siteAddress}` : ""}
            </Text>
          </View>
        )}
        {!payload.siteAddress && payload.customerAddress && (
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.address}</Text>
            <Text style={[styles.partyValue, autoFont(payload.customerAddress)]}>
              {payload.customerAddress}
            </Text>
          </View>
        )}
        {payload.recipientName && (
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.recipient}</Text>
            <Text style={[styles.partyValue, autoFont(payload.recipientName)]}>
              {payload.recipientName}
              {payload.recipientTitle ? ` (${payload.recipientTitle})` : ""}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitleP, autoFont(P.equipmentList)]}>{P.equipmentList}</Text>
          <Text style={[styles.sectionTitleS, autoFont(S.equipmentList)]}> / {S.equipmentList}</Text>
        </View>
        <View style={styles.tableHead}>
          <Text style={[styles.cIdx, styles.cHeadText]}>{P.idx}</Text>
          <Text style={[styles.cLoc, styles.cHeadText]}>{P.loc}</Text>
          <Text style={[styles.cModel, styles.cHeadText]}>{P.model}</Text>
          <Text style={[styles.cSerial, styles.cHeadText]}>{P.serial}</Text>
          <Text style={[styles.cWork, styles.cHeadText]}>{P.work}</Text>
          <Text style={[styles.cNotes, styles.cHeadText]}>{P.notes}</Text>
        </View>
        {payload.equipment.map((e, idx) => (
          <View key={`${e.modelCode}-${idx}`} style={styles.tableRow}>
            <Text style={styles.cIdx}>{idx + 1}</Text>
            <Text style={[styles.cLoc, autoFont(e.location ?? null)]}>
              {e.location ?? "—"}
            </Text>
            <Text style={[styles.cModel, autoFont(e.modelName)]}>
              {e.modelCode}
              {"\n"}
              <Text style={{ color: "#777", fontSize: 6.5 }}>{e.modelName}</Text>
            </Text>
            <Text style={styles.cSerial}>{e.serialNumber ?? "—"}</Text>
            <Text style={[styles.cWork, autoFont(e.workSummary)]}>{e.workSummary}</Text>
            <Text style={[styles.cNotes, autoFont(e.notes ?? null)]}>
              {e.notes ?? "—"}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 7, color: "#888", marginTop: 4 }}>
        {P.noPriceNotice}
      </Text>

      {payload.generalNotes && (
        <View style={{ marginTop: 4 }}>
          <Bi
            primary={`${P.notes}:`}
            secondary={S.notes}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.partyValue, autoFont(payload.generalNotes)]}>
            {payload.generalNotes}
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
          {payload.recipientName && (
            <Text style={[styles.signName, autoFont(payload.recipientName)]}>
              {payload.recipientName}
            </Text>
          )}
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
          <Text style={[styles.signName, autoFont(payload.technicianName)]}>
            {payload.technicianName}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function PeriodicCheckB2B({
  payload,
}: Readonly<{ payload: PeriodicCheckB2bPayload }>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const equipmentCount = payload.equipment.length;
  const singlePage = equipmentCount <= SINGLE_PAGE_THRESHOLD;
  const tearText = `${P.tearHere} ✂ ${S.tearHere}`;
  if (singlePage) {
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
  // 5~10개: 각 사본을 별도 페이지로.
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCustomer} />
      </Page>
      <Page size="A4" style={styles.page} wrap>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCompany} />
      </Page>
    </Document>
  );
}
