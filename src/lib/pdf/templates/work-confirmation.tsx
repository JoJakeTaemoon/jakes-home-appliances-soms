/**
 * Work Confirmation PDF (DOCUMENT_TEMPLATES.md #6 + #7).
 *
 * B2C single visit + B2B periodic check use the same template — we toggle a
 * couple of meta rows for B2B (Site, Tax code). The signed photo is shown as
 * a small thumbnail (file-based, served by the same uploads directory).
 */

import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { Bi } from "./shared";
import { splitLangPair, type PdfLangPair } from "@/lib/pdf/types";
import { PDF_DEFAULT_FAMILY, PDF_FONT_FAMILY } from "@/lib/pdf/fonts";

const WATERMARK_LOGO_PATH = path.join(
  process.cwd(),
  "public",
  "logo",
  "seoul-aqua-logo.jpg",
);

export type WorkConfLocale = "ko" | "vi" | "en";

// Inline Hangul detector — picks Noto Sans KR for KO data values; default
// Be Vietnam Pro handles VI diacritics + Latin out of the box.
const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;
function autoFont(s: string | null | undefined) {
  return s && HANGUL_RE.test(s)
    ? { fontFamily: PDF_FONT_FAMILY.ko }
    : { fontFamily: PDF_DEFAULT_FAMILY };
}

export interface WorkConfPhoto {
  storageKey: string; // relative path under uploads/
  absolutePath: string;
  takenAt?: Date | null;
}

export interface WorkConfPayload {
  visitNumber: string; // visit.id slice for display
  visitType: string;
  customerName: string;
  customerCode: string;
  customerType: "B2C" | "B2B";
  taxCode: string | null;
  siteName: string | null;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  technicianName: string;
  collaboratorNames: string[];
  equipment: {
    modelCode: string;
    modelName: string;
    serialNumber: string | null;
  } | null;
  findings: string;
  partsReplaced: string[];
  photos: WorkConfPhoto[];
  signaturePhoto: WorkConfPhoto | null;
  collectedAmount: number | null;
  paymentMethod: string | null;
  langPair: PdfLangPair;
  generatedAt: Date;
}

const styles = StyleSheet.create({
  page: { padding: 22, fontSize: 9.5, fontFamily: PDF_DEFAULT_FAMILY, color: "#111" },
  brand: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0C6BA8",
    paddingBottom: 3,
    marginBottom: 5,
  },
  brandTitle: { fontSize: 12, fontWeight: "bold", color: "#0C6BA8" },
  brandLegal: { fontSize: 7, color: "#666" },
  docTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 2,
    textAlign: "center",
  },
  docTitleSecondary: {
    fontSize: 10,
    fontWeight: "normal",
    color: "#555",
    marginBottom: 8,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: "#0C6BA8",
  },
  sectionTitleSecondary: {
    fontSize: 8,
    fontWeight: "normal",
    color: "#6AA4C8",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 1,
    marginBottom: 3,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 120, color: "#666" },
  labelSecondary: { fontSize: 8, color: "#999" },
  value: { flex: 1, color: "#111" },
  findings: { lineHeight: 1.5, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: "#0C6BA8",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8.5,
    color: "#0C6BA8",
    marginRight: 4,
    marginBottom: 4,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  photoBox: {
    width: 100,
    height: 100,
    borderWidth: 1,
    borderColor: "#ddd",
    marginRight: 6,
    marginBottom: 6,
    padding: 1,
  },
  photoImg: { width: "100%", height: "100%", objectFit: "cover" },
  signatureBox: {
    width: 200,
    height: 100,
    borderWidth: 1,
    borderColor: "#111",
    marginTop: 6,
  },
  signatureImg: { width: "100%", height: "100%", objectFit: "contain" },
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
  watermarkImage: { width: 260, height: 260, objectFit: "contain" },

  // 2-column "visit + customer" row + wide work-block layout.
  topRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  topCol: { flex: 1 },
  wideBlock: { marginBottom: 6 },
});

interface LabelDict {
  title: string;
  visit: string;
  visitNo: string;
  visitType: string;
  customer: string;
  customerCode: string;
  taxCode: string;
  site: string;
  address: string;
  contact: string;
  scheduledFor: string;
  startedAt: string;
  completedAt: string;
  technician: string;
  collaborators: string;
  equipment: string;
  model: string;
  serial: string;
  findings: string;
  partsReplaced: string;
  photos: string;
  signature: string;
  payment: string;
  paymentMethod: string;
  generated: string;
  pageOf: string;
  none: string;
}

const LABELS: Record<WorkConfLocale, LabelDict> = {
  vi: {
    title: "PHIẾU XÁC NHẬN CÔNG VIỆC",
    visit: "Thông tin lượt thăm",
    visitNo: "Số phiếu",
    visitType: "Loại",
    customer: "Khách hàng",
    customerCode: "Mã KH",
    taxCode: "Mã số thuế",
    site: "Cơ sở",
    address: "Địa chỉ",
    contact: "Người LH",
    scheduledFor: "Giờ hẹn",
    startedAt: "Bắt đầu",
    completedAt: "Hoàn tất",
    technician: "KTV chính",
    collaborators: "KTV phụ",
    equipment: "Thiết bị",
    model: "Mã model",
    serial: "Số seri",
    findings: "Nội dung công việc",
    partsReplaced: "Phụ tùng thay",
    photos: "Hình ảnh hiện trường",
    signature: "Chữ ký khách hàng",
    payment: "Số tiền đã thu",
    paymentMethod: "Phương thức",
    generated: "Lập lúc",
    pageOf: "Trang {page}/{total}",
    none: "Không có",
  },
  ko: {
    title: "작업 확인서",
    visit: "방문 정보",
    visitNo: "번호",
    visitType: "유형",
    customer: "고객",
    customerCode: "고객코드",
    taxCode: "세금코드",
    site: "사이트",
    address: "주소",
    contact: "담당자",
    scheduledFor: "예정 시간",
    startedAt: "시작",
    completedAt: "완료",
    technician: "주관 기사",
    collaborators: "협업 기사",
    equipment: "장비",
    model: "모델",
    serial: "시리얼",
    findings: "작업 내용",
    partsReplaced: "교체 부품",
    photos: "현장 사진",
    signature: "고객 서명",
    payment: "수금액",
    paymentMethod: "결제 방식",
    generated: "발행",
    pageOf: "{page}/{total} 페이지",
    none: "없음",
  },
  en: {
    title: "WORK CONFIRMATION",
    visit: "Visit information",
    visitNo: "Visit #",
    visitType: "Type",
    customer: "Customer",
    customerCode: "Customer code",
    taxCode: "Tax code",
    site: "Site",
    address: "Address",
    contact: "Contact",
    scheduledFor: "Scheduled",
    startedAt: "Started",
    completedAt: "Completed",
    technician: "Lead technician",
    collaborators: "Collaborators",
    equipment: "Equipment",
    model: "Model",
    serial: "Serial",
    findings: "Work performed",
    partsReplaced: "Parts replaced",
    photos: "On-site photos",
    signature: "Customer signature",
    payment: "Amount collected",
    paymentMethod: "Method",
    generated: "Generated",
    pageOf: "Page {page} of {total}",
    none: "None",
  },
};

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  // Primary language is always Vietnamese → DD/MM/YYYY.
  return `${day}/${m}/${y} ${hh}:${mm}`;
}

function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(Math.round(n)).toString();
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${withDots} VND`;
}

/**
 * One A4 sheet's worth of work-confirmation content. Two sheets per
 * visit (customer + company copies) — both identical, no "Bản ... giữ"
 * label per Phase-6 customer feedback.
 *
 * Layout: 2-column "Visit info | Customer info" row at top, then the
 * equipment card (full width), then the wide work-performed +
 * parts-replaced blocks where the technician hand-writes the bulk of
 * the slip.
 */
function SheetContent({
  payload,
  P,
  S,
  showSite,
  noneLine,
  biLabel,
  section,
}: Readonly<{
  payload: WorkConfPayload;
  P: LabelDict;
  S: LabelDict;
  showSite: boolean;
  noneLine: string;
  biLabel: (key: keyof LabelDict) => React.ReactElement;
  section: (k: keyof LabelDict) => React.ReactElement;
}>) {
  return (
    <>
      <View style={styles.watermark}>
        <Image src={WATERMARK_LOGO_PATH} style={styles.watermarkImage} />
      </View>
      <View style={styles.brand}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flex: 1 }}>
          <Text style={styles.brandTitle}>SEOUL AQUA </Text>
          <Text style={styles.brandLegal}>· CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)</Text>
        </View>
        <Text style={[{ fontSize: 9, color: "#666" }, autoFont(`${P.visitNo}${S.visitNo}`)]}>
          {P.visitNo} / {S.visitNo}:{" "}
          <Text style={{ fontSize: 10, fontWeight: "bold", color: "#111" }}>
            {payload.visitNumber}
          </Text>
        </Text>
      </View>

      <Text style={[styles.docTitle, autoFont(P.title)]}>{P.title}</Text>
      <Text style={[styles.docTitleSecondary, autoFont(S.title)]}>{S.title}</Text>

      {/* 2-column row: visit info | customer info */}
      <View style={styles.topRow}>
        <View style={styles.topCol}>
          {section("visit")}
          <View style={styles.card}>
            <View style={styles.row}>
              {biLabel("visitType")}
              <Text style={styles.value}>{payload.visitType}</Text>
            </View>
            <View style={styles.row}>
              {biLabel("scheduledFor")}
              <Text style={styles.value}>{formatDate(payload.scheduledFor)}</Text>
            </View>
            <View style={styles.row}>
              {biLabel("startedAt")}
              <Text style={styles.value}>{formatDate(payload.startedAt)}</Text>
            </View>
            <View style={styles.row}>
              {biLabel("completedAt")}
              <Text style={styles.value}>{formatDate(payload.completedAt)}</Text>
            </View>
            <View style={styles.row}>
              {biLabel("technician")}
              <Text style={[styles.value, autoFont(payload.technicianName)]}>
                {payload.technicianName}
              </Text>
            </View>
            {payload.collaboratorNames.length > 0 && (
              <View style={styles.row}>
                {biLabel("collaborators")}
                <Text style={[styles.value, autoFont(payload.collaboratorNames.join(", "))]}>
                  {payload.collaboratorNames.join(", ")}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.topCol}>
          {section("customer")}
          <View style={styles.card}>
            <View style={styles.row}>
              {biLabel("customer")}
              <Text style={[styles.value, autoFont(payload.customerName)]}>
                {payload.customerName}
              </Text>
            </View>
            <View style={styles.row}>
              {biLabel("customerCode")}
              <Text style={styles.value}>{payload.customerCode}</Text>
            </View>
            {payload.customerType === "B2B" && payload.taxCode && (
              <View style={styles.row}>
                {biLabel("taxCode")}
                <Text style={styles.value}>{payload.taxCode}</Text>
              </View>
            )}
            {showSite && payload.siteName && (
              <View style={styles.row}>
                {biLabel("site")}
                <Text style={[styles.value, autoFont(payload.siteName)]}>
                  {payload.siteName}
                </Text>
              </View>
            )}
            <View style={styles.row}>
              {biLabel("address")}
              <Text style={[styles.value, autoFont(payload.address)]}>
                {payload.address || "—"}
              </Text>
            </View>
            {payload.contactName && (
              <View style={styles.row}>
                {biLabel("contact")}
                <Text style={[styles.value, autoFont(payload.contactName)]}>
                  {payload.contactName}
                  {payload.contactPhone ? ` · ${payload.contactPhone}` : ""}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {payload.equipment && (
        <View style={styles.wideBlock}>
          {section("equipment")}
          <View style={styles.card}>
            <View style={styles.row}>
              {biLabel("model")}
              <Text style={[styles.value, autoFont(payload.equipment.modelName)]}>
                {payload.equipment.modelCode} — {payload.equipment.modelName}
              </Text>
            </View>
            <View style={styles.row}>
              {biLabel("serial")}
              <Text style={styles.value}>
                {payload.equipment.serialNumber ?? "—"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Wide free-text canvas — tech hand-writes the work here. */}
      <View style={styles.wideBlock}>
        {section("findings")}
        <View style={[styles.card, { minHeight: 110 }]}>
          <Text style={[styles.findings, autoFont(payload.findings || noneLine)]}>
            {payload.findings || noneLine}
          </Text>
        </View>
      </View>

      <View style={styles.wideBlock}>
        {section("partsReplaced")}
        <View style={[styles.card, { minHeight: 60 }]}>
          {payload.partsReplaced.length === 0 ? (
            <Text style={[styles.value, autoFont(noneLine)]}>{noneLine}</Text>
          ) : (
            <View style={styles.chipRow}>
              {payload.partsReplaced.map((p, i) => (
                <Text key={`${p}-${i}`} style={[styles.chip, autoFont(p)]}>
                  {p}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>

      {payload.photos.length > 0 && (
        <>
          {section("photos")}
          <View style={styles.photoGrid}>
            {payload.photos.slice(0, 12).map((p, i) => (
              <View key={`${p.storageKey}-${i}`} style={styles.photoBox}>
                <Image src={p.absolutePath} style={styles.photoImg} />
              </View>
            ))}
          </View>
        </>
      )}

      {payload.collectedAmount !== null &&
        payload.collectedAmount !== undefined && (
          <>
            {section("payment")}
            <View style={styles.card}>
              <View style={styles.row}>
                {biLabel("payment")}
                <Text style={styles.value}>
                  {formatVnd(payload.collectedAmount)}
                </Text>
              </View>
              {payload.paymentMethod && (
                <View style={styles.row}>
                  {biLabel("paymentMethod")}
                  <Text style={styles.value}>{payload.paymentMethod}</Text>
                </View>
              )}
            </View>
          </>
        )}

      <View style={{ flexGrow: 1 }} />
      {section("signature")}
      {payload.signaturePhoto ? (
        <View style={styles.signatureBox}>
          <Image
            src={payload.signaturePhoto.absolutePath}
            style={styles.signatureImg}
          />
        </View>
      ) : (
        <View style={{ width: 200, height: 70, borderWidth: 1, borderColor: "#111", marginTop: 4 }} />
      )}
    </>
  );
}

export function WorkConfirmation({ payload }: Readonly<{ payload: WorkConfPayload }>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const showSite = payload.customerType === "B2B";
  const biLabel = (key: keyof LabelDict) => (
    <Bi primary={P[key]} secondary={S[key]} style={styles.label} subStyle={styles.labelSecondary} />
  );
  const section = (k: keyof LabelDict) => (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, autoFont(P[k])]}>{P[k]}</Text>
      <Text style={[styles.sectionTitleSecondary, autoFont(S[k])]}> / {S[k]}</Text>
    </View>
  );
  const noneLine = `${P.none} / ${S.none}`;
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <SheetContent
          payload={payload}
          P={P}
          S={S}
          showSite={showSite}
          noneLine={noneLine}
          biLabel={biLabel}
          section={section}
        />
      </Page>
      <Page size="A4" style={styles.page} wrap>
        <SheetContent
          payload={payload}
          P={P}
          S={S}
          showSite={showSite}
          noneLine={noneLine}
          biLabel={biLabel}
          section={section}
        />
      </Page>
    </Document>
  );
}
