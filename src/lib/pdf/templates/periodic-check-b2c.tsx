/**
 * B2C Periodic Check + Receipt PDF (DOCUMENT_TEMPLATES.md §6).
 *
 * 정기 점검표 — 가정집 (B2C). 점검 내역 + 청구 항목 + 결제까지 한 장.
 * A4 한 장에 2부 (고객 / 회사) + 가운데 절취선.
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

export interface PeriodicCheckTaskLine {
  consumableSku: string;
  consumableName: string;
  action: "REPLACE" | "CLEAN";
  notes: string | null;
}

export interface PeriodicCheckChargeLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface PeriodicCheckB2cPayload {
  visitNumber: string;
  customerName: string;
  customerCode: string;
  address: string;
  contactName: string | null;
  contactPhone: string | null;
  visitDate: Date;
  technicianName: string;
  equipmentModelCode: string;
  equipmentModelName: string;
  equipmentSerial: string | null;
  contractType: "RENTAL" | "SALE" | "MAINTENANCE" | null;
  monthlyFee: number | null;
  tasks: PeriodicCheckTaskLine[];
  charges: PeriodicCheckChargeLine[];
  outstandingCarryover: number;
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
    padding: 5,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 9, fontWeight: "bold", color: "#0C6BA8", marginBottom: 2 },
  sectionTitleSec: { fontSize: 7.5, fontWeight: "normal", color: "#6AA4C8", marginBottom: 3 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 1,
    marginBottom: 2,
  },
  sectionTitleP: { fontSize: 9, fontWeight: "bold", color: "#0C6BA8" },
  sectionTitleS: { fontSize: 7.5, color: "#6AA4C8" },

  partyLine: { flexDirection: "row", marginBottom: 1 },
  partyLabel: { width: 60, fontSize: 7, color: "#888" },
  partyValue: { flex: 1, fontSize: 8, color: "#111" },

  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    borderTopWidth: 0.7,
    borderBottomWidth: 0.7,
    borderColor: "#bbb",
    marginTop: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  cIdx: { width: 18, fontSize: 7.5 },
  cTaskName: { flex: 2, fontSize: 7.5 },
  cTaskAction: { width: 70, fontSize: 7.5 },
  cTaskNote: { flex: 2.2, fontSize: 7.5 },
  cChargeDesc: { flex: 2.5, fontSize: 7.5 },
  cChargeQty: { width: 28, textAlign: "right", fontSize: 7.5 },
  cChargeUnit: { width: 70, textAlign: "right", fontSize: 7.5 },
  cChargeTotal: { width: 84, textAlign: "right", fontSize: 7.5 },
  cHeadText: { fontSize: 7, fontWeight: "bold", color: "#222" },
  cHeadSec: { fontSize: 6.2, fontWeight: "normal", color: "#888" },

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
  visitNo: string;
  date: string;
  customer: string;
  name: string;
  customerCode: string;
  address: string;
  contact: string;
  technician: string;
  equipment: string;
  model: string;
  serial: string;
  tasks: string;
  tasksHead: string;
  taskAction: string;
  taskNotes: string;
  actionReplace: string;
  actionClean: string;
  charges: string;
  chargesHead: string;
  chargeDesc: string;
  chargeQty: string;
  chargeUnit: string;
  chargeTotal: string;
  grandTotal: string;
  carryover: string;
  monthlyFee: string;
  signCustomer: string;
  signTechnician: string;
  notes: string;
  none: string;
  tearHere: string;
}

const LABELS: Record<DocLocale, LabelDict> = {
  vi: {
    title: "PHIẾU BẢO TRÌ ĐỊNH KỲ (HỘ GIA ĐÌNH)",
    copyCustomer: "Bản khách hàng giữ",
    copyCompany: "Bản công ty giữ",
    visitNo: "Số phiếu",
    date: "Ngày thăm",
    customer: "Khách hàng",
    name: "Họ tên",
    customerCode: "Mã KH",
    address: "Địa chỉ",
    contact: "Liên hệ",
    technician: "KTV phụ trách",
    equipment: "Thiết bị",
    model: "Model",
    serial: "Số seri",
    tasks: "Nội dung bảo trì",
    tasksHead: "Vật tư / công việc",
    taskAction: "Hành động",
    taskNotes: "Ghi chú",
    actionReplace: "Thay mới",
    actionClean: "Vệ sinh",
    charges: "Phí dịch vụ",
    chargesHead: "Hạng mục",
    chargeDesc: "Mô tả",
    chargeQty: "SL",
    chargeUnit: "Đơn giá",
    chargeTotal: "Thành tiền",
    grandTotal: "TỔNG CỘNG",
    carryover: "Còn nợ trước",
    monthlyFee: "Phí thuê tháng",
    signCustomer: "Khách hàng ký",
    signTechnician: "KTV ký",
    notes: "Ghi chú",
    none: "—",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
  },
  ko: {
    title: "정기 점검표 (가정집)",
    copyCustomer: "고객 보관용",
    copyCompany: "회사 보관용",
    visitNo: "방문 번호",
    date: "점검일",
    customer: "고객",
    name: "성명",
    customerCode: "고객코드",
    address: "주소",
    contact: "연락처",
    technician: "담당 기사",
    equipment: "장비",
    model: "모델",
    serial: "시리얼",
    tasks: "점검 작업 내역",
    tasksHead: "소모품 / 작업",
    taskAction: "작업",
    taskNotes: "비고",
    actionReplace: "교체",
    actionClean: "청소",
    charges: "청구 항목",
    chargesHead: "항목",
    chargeDesc: "설명",
    chargeQty: "수량",
    chargeUnit: "단가",
    chargeTotal: "금액",
    grandTotal: "총 합계",
    carryover: "이월 잔여",
    monthlyFee: "월 임대료",
    signCustomer: "고객 서명",
    signTechnician: "기사 서명",
    notes: "비고",
    none: "—",
    tearHere: "이 선을 따라 자르세요",
  },
  en: {
    title: "PERIODIC CHECK (B2C)",
    copyCustomer: "Customer copy",
    copyCompany: "Company copy",
    visitNo: "Visit no.",
    date: "Visit date",
    customer: "Customer",
    name: "Name",
    customerCode: "Code",
    address: "Address",
    contact: "Contact",
    technician: "Lead technician",
    equipment: "Equipment",
    model: "Model",
    serial: "Serial",
    tasks: "Service performed",
    tasksHead: "Consumable / task",
    taskAction: "Action",
    taskNotes: "Notes",
    actionReplace: "Replace",
    actionClean: "Clean",
    charges: "Charges",
    chargesHead: "Item",
    chargeDesc: "Description",
    chargeQty: "Qty",
    chargeUnit: "Unit price",
    chargeTotal: "Amount",
    grandTotal: "GRAND TOTAL",
    carryover: "Outstanding",
    monthlyFee: "Monthly fee",
    signCustomer: "Customer signature",
    signTechnician: "Technician signature",
    notes: "Notes",
    none: "—",
    tearHere: "CUT ALONG THIS LINE",
  },
};

function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

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
  payload: PeriodicCheckB2cPayload;
  P: LabelDict;
  S: LabelDict;
  copyLabel: string;
}>) {
  // RENTAL 시 월 임대료를 청구 항목 표에 첫 row 로 합쳐 표시.
  // 별도 totals 박스 없이 표 안 tfoot 에 총합만 노출.
  const chargeRows: PeriodicCheckChargeLine[] =
    payload.contractType === "RENTAL" && payload.monthlyFee !== null
      ? [
          {
            description: `${P.monthlyFee} / ${S.monthlyFee}`,
            quantity: 1,
            unitPrice: payload.monthlyFee,
          },
          ...payload.charges,
        ]
      : payload.charges;
  const rowsTotal = chargeRows.reduce(
    (acc, c) => acc + c.unitPrice * c.quantity,
    0,
  );
  return (
    <View style={styles.copy}>
      <View style={styles.watermark}>
        <Image src={WATERMARK_LOGO_PATH} style={styles.watermarkImage} />
      </View>
      <View style={styles.brand}>
        <View style={{ flexDirection: "row", alignItems: "baseline", flex: 1 }}>
          <Text style={styles.brandTitle}>JAKE'S HOME APPLIANCES </Text>
          <Text style={styles.brandLegal}>· CÔNG TY TNHH MTV TM&DV JAKE'S HA (Jake's Home Appliances)</Text>
        </View>
        <Text style={styles.brandLegal}>cs@jakeshomeappliances.com.vn · {payload.hqPhone}</Text>
      </View>

      <Text style={[styles.docTitle, autoFont(P.title)]}>{P.title}</Text>
      <Text style={[styles.docTitleSec, autoFont(S.title)]}>
        {S.title} · {copyLabel}
      </Text>

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
          {payload.contactName && (
            <View style={[styles.partyLine, { flex: 1 }]}>
              <Text style={styles.partyLabel}>{P.contact}</Text>
              <Text style={[styles.partyValue, autoFont(payload.contactName)]}>
                {payload.contactName}
                {payload.contactPhone ? ` · ${payload.contactPhone}` : ""}
              </Text>
            </View>
          )}
        </View>
        {payload.address && (
          <View style={styles.partyLine}>
            <Text style={styles.partyLabel}>{P.address}</Text>
            <Text style={[styles.partyValue, autoFont(payload.address)]}>
              {payload.address}
            </Text>
          </View>
        )}
        <View style={styles.partyLine}>
          <Text style={styles.partyLabel}>{P.equipment}</Text>
          <Text style={[styles.partyValue, autoFont(payload.equipmentModelName)]}>
            {payload.equipmentModelCode} — {payload.equipmentModelName}
            {payload.equipmentSerial ? ` · ${payload.equipmentSerial}` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitleP, autoFont(P.tasks)]}>{P.tasks}</Text>
          <Text style={[styles.sectionTitleS, autoFont(S.tasks)]}> / {S.tasks}</Text>
        </View>
        {payload.tasks.length === 0 ? (
          <Text style={{ fontSize: 8, color: "#777" }}>{P.none} / {S.none}</Text>
        ) : (
          <>
            <View style={styles.tableHead}>
              <Text style={[styles.cIdx, styles.cHeadText]}>#</Text>
              <Text style={[styles.cTaskName, styles.cHeadText]}>
                {P.tasksHead}
                {"\n"}
                <Text style={[styles.cHeadSec, autoFont(S.tasksHead)]}>{S.tasksHead}</Text>
              </Text>
              <Text style={[styles.cTaskAction, styles.cHeadText]}>{P.taskAction}</Text>
              <Text style={[styles.cTaskNote, styles.cHeadText]}>{P.taskNotes}</Text>
            </View>
            {payload.tasks.map((t, idx) => (
              <View key={`${t.consumableSku}-${idx}`} style={styles.tableRow}>
                <Text style={styles.cIdx}>{idx + 1}</Text>
                <Text style={[styles.cTaskName, autoFont(t.consumableName)]}>
                  {t.consumableName}{" "}
                  <Text style={{ color: "#777", fontSize: 6.5 }}>({t.consumableSku})</Text>
                </Text>
                <Text style={styles.cTaskAction}>
                  {t.action === "REPLACE" ? P.actionReplace : P.actionClean}
                </Text>
                <Text style={[styles.cTaskNote, autoFont(t.notes ?? null)]}>
                  {t.notes ?? "—"}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitleP, autoFont(P.charges)]}>{P.charges}</Text>
          <Text style={[styles.sectionTitleS, autoFont(S.charges)]}> / {S.charges}</Text>
        </View>
        {chargeRows.length === 0 ? (
          <Text style={{ fontSize: 8, color: "#777" }}>{P.none} / {S.none}</Text>
        ) : (
          <>
            <View style={styles.tableHead}>
              <Text style={[styles.cIdx, styles.cHeadText]}>#</Text>
              <Text style={[styles.cChargeDesc, styles.cHeadText]}>
                {P.chargeDesc}
                {"\n"}
                <Text style={[styles.cHeadSec, autoFont(S.chargeDesc)]}>{S.chargeDesc}</Text>
              </Text>
              <Text style={[styles.cChargeQty, styles.cHeadText]}>{P.chargeQty}</Text>
              <Text style={[styles.cChargeUnit, styles.cHeadText]}>{P.chargeUnit}</Text>
              <Text style={[styles.cChargeTotal, styles.cHeadText]}>{P.chargeTotal}</Text>
            </View>
            {chargeRows.map((c, idx) => (
              <View key={`charge-${idx}`} style={styles.tableRow}>
                <Text style={styles.cIdx}>{idx + 1}</Text>
                <Text style={[styles.cChargeDesc, autoFont(c.description)]}>
                  {c.description}
                </Text>
                <Text style={styles.cChargeQty}>{c.quantity}</Text>
                <Text style={styles.cChargeUnit}>{formatVnd(c.unitPrice)}</Text>
                <Text style={styles.cChargeTotal}>{formatVnd(c.unitPrice * c.quantity)}</Text>
              </View>
            ))}
            <View
              style={[
                styles.tableRow,
                { borderTopWidth: 1, borderTopColor: "#0C6BA8", backgroundColor: "#F0F8FE", borderBottomWidth: 0 },
              ]}
            >
              <Text style={styles.cIdx} />
              <Text style={[styles.cChargeDesc, { textAlign: "right", fontWeight: "bold", color: "#0C6BA8" }]}>
                {P.grandTotal} / {S.grandTotal}
              </Text>
              <Text style={styles.cChargeQty} />
              <Text style={styles.cChargeUnit} />
              <Text style={[styles.cChargeTotal, { fontSize: 10.5, fontWeight: "bold", color: "#0C6BA8" }]}>
                {formatVnd(rowsTotal)}
              </Text>
            </View>
          </>
        )}
        {payload.outstandingCarryover > 0 && (
          <Text
            style={[
              { fontSize: 7.5, color: "#B45309", fontWeight: "bold", marginTop: 2, textAlign: "right" },
              autoFont(`${P.carryover}${S.carryover}`),
            ]}
          >
            {P.carryover} / {S.carryover}: {formatVnd(payload.outstandingCarryover)}
          </Text>
        )}
      </View>

      {payload.notes && (
        <View style={{ marginTop: 3 }}>
          <Bi
            primary={`${P.notes}:`}
            secondary={S.notes}
            style={styles.metaLabel}
            subStyle={styles.metaLabelSec}
          />
          <Text style={[styles.partyValue, autoFont(payload.notes)]}>
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

export function PeriodicCheckB2C({
  payload,
}: Readonly<{ payload: PeriodicCheckB2cPayload }>) {
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
