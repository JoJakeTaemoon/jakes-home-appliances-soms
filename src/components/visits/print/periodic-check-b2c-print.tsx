/**
 * HTML print twin of the PERIODIC_CHECK_B2C PDF template.
 */

import type { CSSProperties } from "react";
import type { PeriodicCheckB2cPayload } from "@/lib/pdf/visit-preview";
import type { PeriodicCheckChargeLine } from "@/lib/pdf/templates/periodic-check-b2c";
import {
  Bi,
  BrandHeader,
  PrintSheet,
  SignBox,
  TearLine,
  Watermark,
  autoFont,
  formatDate,
  formatVnd,
  splitLangPair,
} from "./print-shared";

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
  tasks: string;
  tasksHead: string;
  taskAction: string;
  taskNotes: string;
  actionReplace: string;
  actionClean: string;
  charges: string;
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

const LABELS: Record<"ko" | "vi" | "en", LabelDict> = {
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
    tasks: "Nội dung bảo trì",
    tasksHead: "Vật tư / công việc",
    taskAction: "Hành động",
    taskNotes: "Ghi chú",
    actionReplace: "Thay mới",
    actionClean: "Vệ sinh",
    charges: "Phí dịch vụ",
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
    tasks: "점검 작업 내역",
    tasksHead: "소모품 / 작업",
    taskAction: "작업",
    taskNotes: "비고",
    actionReplace: "교체",
    actionClean: "청소",
    charges: "청구 항목",
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
    tasks: "Service performed",
    tasksHead: "Consumable / task",
    taskAction: "Action",
    taskNotes: "Notes",
    actionReplace: "Replace",
    actionClean: "Clean",
    charges: "Charges",
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

const COPY_BORDER: CSSProperties = {
  border: "1pt solid #d4d4d4",
  borderRadius: "3pt",
  padding: "6pt",
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
};

const CARD: CSSProperties = {
  border: "1pt solid #e5e5e5",
  borderRadius: "3pt",
  padding: "4pt",
  marginBottom: "3pt",
};

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
  // 기존 totals 박스를 없애고 표 안에 총합 row 만 두기 위해 prepend.
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
    <div style={COPY_BORDER}>
      <Watermark />
      <BrandHeader hqPhone={payload.hqPhone} />

      <div style={{ fontSize: "13pt", fontWeight: "bold", textAlign: "center", ...autoFont(P.title) }}>
        {P.title}
      </div>
      <div
        style={{
          fontSize: "8pt",
          color: "#555",
          textAlign: "center",
          marginBottom: "3pt",
          ...autoFont(S.title),
        }}
      >
        {S.title} · {copyLabel}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3pt" }}>
        <MetaCell P={`${P.visitNo}:`} S={S.visitNo} value={payload.visitNumber} />
        <MetaCell P={`${P.date}:`} S={S.date} value={formatDate(payload.visitDate)} />
        <MetaCell P={`${P.technician}:`} S={S.technician} value={payload.technicianName} />
      </div>

      <div style={CARD}>
        <SectionTitle P={P.customer} S={S.customer} />
        <div style={{ display: "flex", gap: "6pt" }}>
          <div style={{ flex: 1 }}>
            <Line
              label={P.name}
              value={`${payload.customerName} (${payload.customerCode})`}
            />
          </div>
          {payload.contactName && (
            <div style={{ flex: 1 }}>
              <Line
                label={P.contact}
                value={
                  payload.contactName +
                  (payload.contactPhone ? ` · ${payload.contactPhone}` : "")
                }
              />
            </div>
          )}
        </div>
        {payload.address && <Line label={P.address} value={payload.address} />}
        <Line
          label={P.equipment}
          value={`${payload.equipmentModelCode} — ${payload.equipmentModelName}${payload.equipmentSerial ? ` · ${payload.equipmentSerial}` : ""}`}
        />
      </div>

      <div style={CARD}>
        <SectionTitle P={P.tasks} S={S.tasks} />
        {payload.tasks.length === 0 ? (
          <div style={{ fontSize: "8pt", color: "#777" }}>{P.none} / {S.none}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={th(18)}>#</th>
                <th style={th()}>
                  {P.tasksHead}<div style={subHead}>{S.tasksHead}</div>
                </th>
                <th style={th(70)}>{P.taskAction}</th>
                <th style={th()}>{P.taskNotes}</th>
              </tr>
            </thead>
            <tbody>
              {payload.tasks.map((t, idx) => (
                <tr key={`${t.consumableSku}-${idx}`} style={{ borderBottom: "0.5pt solid #eee" }}>
                  <td style={td(18)}>{idx + 1}</td>
                  <td style={{ ...td(), ...autoFont(t.consumableName) }}>
                    {t.consumableName}{" "}
                    <span style={{ color: "#777", fontSize: "6.5pt" }}>({t.consumableSku})</span>
                  </td>
                  <td style={td(70)}>
                    {t.action === "REPLACE" ? P.actionReplace : P.actionClean}
                  </td>
                  <td style={{ ...td(), ...autoFont(t.notes ?? "—") }}>{t.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={CARD}>
        <SectionTitle P={P.charges} S={S.charges} />
        {chargeRows.length === 0 ? (
          <div style={{ fontSize: "8pt", color: "#777" }}>{P.none} / {S.none}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={th(18)}>#</th>
                <th style={th()}>
                  {P.chargeDesc}<div style={subHead}>{S.chargeDesc}</div>
                </th>
                <th style={th(28, "right")}>{P.chargeQty}</th>
                <th style={th(70, "right")}>{P.chargeUnit}</th>
                <th style={th(84, "right")}>{P.chargeTotal}</th>
              </tr>
            </thead>
            <tbody>
              {chargeRows.map((c, idx) => (
                <tr key={`charge-${idx}`} style={{ borderBottom: "0.5pt solid #eee" }}>
                  <td style={td(18)}>{idx + 1}</td>
                  <td style={{ ...td(), ...autoFont(c.description) }}>{c.description}</td>
                  <td style={td(28, "right")}>{c.quantity}</td>
                  <td style={td(70, "right")}>{formatVnd(c.unitPrice)}</td>
                  <td style={td(84, "right")}>{formatVnd(c.unitPrice * c.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1pt solid #0C6BA8", backgroundColor: "#F0F8FE" }}>
                <td colSpan={4} style={{ ...td(), textAlign: "right" }}>
                  <Bi
                    primary={P.grandTotal}
                    secondary={S.grandTotal}
                    style={{ fontSize: "9pt", fontWeight: "bold", color: "#0C6BA8" }}
                    subStyle={{ fontSize: "7pt", color: "#6AA4C8" }}
                  />
                </td>
                <td style={{ ...td(84, "right"), fontSize: "10.5pt", fontWeight: "bold", color: "#0C6BA8" }}>
                  {formatVnd(rowsTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        {payload.outstandingCarryover > 0 && (
          <div
            style={{
              fontSize: "7.5pt",
              color: "#B45309",
              fontWeight: "bold",
              marginTop: "2pt",
              textAlign: "right",
              ...autoFont(`${P.carryover}${S.carryover}`),
            }}
          >
            {P.carryover} / {S.carryover}: {formatVnd(payload.outstandingCarryover)}
          </div>
        )}
      </div>

      {payload.notes && (
        <div style={{ marginTop: "3pt" }}>
          <Bi
            primary={`${P.notes}:`}
            secondary={S.notes}
            style={{ fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <div style={{ fontSize: "8pt", color: "#111", ...autoFont(payload.notes) }}>
            {payload.notes}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "16pt", marginTop: "auto", paddingTop: "6pt" }}>
        <SignBox primary={P.signCustomer} secondary={S.signCustomer} />
        <SignBox primary={P.signTechnician} secondary={S.signTechnician} />
      </div>
    </div>
  );
}

function MetaCell({ P, S, value }: Readonly<{ P: string; S: string; value: string }>) {
  return (
    <div style={{ display: "flex", gap: "4pt", alignItems: "baseline" }}>
      <Bi
        primary={P}
        secondary={S}
        style={{ fontSize: "8pt", color: "#666" }}
        subStyle={{ fontSize: "7pt", color: "#999" }}
      />
      <span style={{ fontSize: "9pt", fontWeight: "bold", ...autoFont(value) }}>{value}</span>
    </div>
  );
}

function SectionTitle({ P, S }: Readonly<{ P: string; S: string }>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "4pt",
        marginBottom: "2pt",
        borderBottom: "0.5pt solid #e5e5e5",
        paddingBottom: "1pt",
      }}
    >
      <span style={{ fontSize: "9pt", fontWeight: "bold", color: "#0C6BA8", ...autoFont(P) }}>
        {P}
      </span>
      <span style={{ fontSize: "7.5pt", color: "#6AA4C8", ...autoFont(S) }}>
        / {S}
      </span>
    </div>
  );
}

function Line({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div style={{ display: "flex", marginBottom: "1pt" }}>
      <span style={{ width: "60pt", fontSize: "7pt", color: "#888" }}>{label}</span>
      <span style={{ flex: 1, fontSize: "8pt", color: "#111", ...autoFont(value) }}>
        {value}
      </span>
    </div>
  );
}

const subHead: CSSProperties = {
  fontSize: "6.2pt",
  fontWeight: "normal",
  color: "#888",
};

function th(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7pt",
    fontWeight: "bold",
    color: "#222",
    textAlign: align ?? "left",
    padding: "2.5pt 4pt",
    borderTop: "0.7pt solid #bbb",
    borderBottom: "0.7pt solid #bbb",
  };
}

function td(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7.5pt",
    padding: "2.5pt 4pt",
    textAlign: align ?? "left",
    verticalAlign: "top",
  };
}

interface Props {
  payload: PeriodicCheckB2cPayload;
  printPageBreak?: boolean;
}

export function PeriodicCheckB2cPrint({ payload, printPageBreak }: Readonly<Props>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  return (
    <PrintSheet printPageBreak={printPageBreak}>
      <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCustomer} />
      <TearLine primaryLabel={P.tearHere} secondaryLabel={S.tearHere} />
      <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCompany} />
    </PrintSheet>
  );
}
