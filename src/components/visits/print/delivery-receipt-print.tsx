/**
 * HTML print twin of {@link import("@/lib/pdf/templates/delivery-receipt").DeliveryReceipt}.
 *
 * Receives the same payload, lays out the same bilingual labels + two
 * copies + tear line on a single A4 sheet, and adds the centered
 * watermark logo.
 */

import type { CSSProperties } from "react";
import type { DeliveryReceiptPayload } from "@/lib/pdf/visit-preview";
import {
  Bi,
  BrandHeader,
  PrintSheet,
  SignBox,
  TearLine,
  Watermark,
  autoFont,
  formatDateTime,
  splitLangPair,
} from "./print-shared";

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

const LABELS: Record<"ko" | "vi" | "en", LabelDict> = {
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
    <div style={COPY_BORDER}>
      <Watermark />
      <BrandHeader hqPhone={payload.hqPhone} />

      <div
        style={{
          fontSize: "13pt",
          fontWeight: "bold",
          textAlign: "center",
          ...autoFont(P.title),
        }}
      >
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
        <div style={{ display: "flex", gap: "4pt", alignItems: "baseline" }}>
          <Bi
            primary={`${P.visitNo}:`}
            secondary={S.visitNo}
            style={{ fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <span style={{ fontSize: "9pt", fontWeight: "bold" }}>{payload.visitNumber}</span>
        </div>
        <div style={{ display: "flex", gap: "4pt", alignItems: "baseline" }}>
          <Bi
            primary={`${P.contractNo}:`}
            secondary={S.contractNo}
            style={{ fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <span style={{ fontSize: "9pt", fontWeight: "bold" }}>{payload.contractNumber}</span>
        </div>
        <div style={{ display: "flex", gap: "4pt", alignItems: "baseline" }}>
          <Bi
            primary={`${P.date}:`}
            secondary={S.date}
            style={{ fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <span style={{ fontSize: "9pt", fontWeight: "bold" }}>
            {formatDateTime(payload.installedAt)}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "6pt", marginBottom: "3pt" }}>
        <PartyBox
          header={P.customer}
          headerSec={S.customer}
          lines={[
            { label: P.name, value: payload.customerName },
            { label: P.customerCode, value: payload.customerCode },
            payload.address ? { label: P.address, value: payload.address } : null,
            payload.contactName
              ? {
                  label: P.contact,
                  value:
                    payload.contactName +
                    (payload.contactPhone ? ` · ${payload.contactPhone}` : ""),
                }
              : null,
          ].filter(Boolean) as { label: string; value: string }[]}
        />
        <PartyBox
          header={P.company}
          headerSec={S.company}
          lines={[
            { label: P.name, value: "JAKE'S HOME APPLIANCES" },
            { label: P.contact, value: payload.technicianName },
            { label: P.phone, value: payload.hqPhone },
          ]}
        />
      </div>

      <div style={{ marginTop: "2pt", display: "flex", alignItems: "baseline", gap: "4pt" }}>
        <span style={{ fontSize: "9pt", fontWeight: "bold", color: "#0C6BA8", ...autoFont(P.equipment) }}>
          {P.equipment}
        </span>
        <span style={{ fontSize: "7.5pt", color: "#6AA4C8", ...autoFont(S.equipment) }}>
          / {S.equipment}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "2pt" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th style={tableTh(22)}>{P.idx}</th>
            <th style={tableTh()}>
              {P.model}
              <div style={{ fontSize: "6.5pt", fontWeight: "normal", color: "#888" }}>
                {S.model}
              </div>
            </th>
            <th style={tableTh()}>
              {P.serial}
              <div style={{ fontSize: "6.5pt", fontWeight: "normal", color: "#888" }}>
                {S.serial}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {payload.equipment.map((e, idx) => (
            <tr key={`${e.modelCode}-${idx}`} style={{ borderBottom: "0.5pt solid #eee" }}>
              <td style={tableTd(22)}>{idx + 1}</td>
              <td style={tableTd()}>
                <div style={autoFont(e.modelName)}>{e.modelCode}</div>
                <div style={{ color: "#666", fontSize: "7pt", ...autoFont(e.modelName) }}>
                  {e.modelName}
                </div>
              </td>
              <td style={tableTd()}>{e.serialNumber ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {payload.notes && (
        <div style={{ marginTop: "4pt", marginBottom: "3pt" }}>
          <Bi
            primary={P.notes}
            secondary={S.notes}
            style={{ fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <div style={{ fontSize: "8pt", color: "#111", marginTop: "1pt", ...autoFont(payload.notes) }}>
            {payload.notes}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "16pt", marginTop: "auto", paddingTop: "8pt" }}>
        <SignBox primary={P.signCustomer} secondary={S.signCustomer} />
        <SignBox primary={P.signTechnician} secondary={S.signTechnician} />
      </div>
    </div>
  );
}

function PartyBox({
  header,
  headerSec,
  lines,
}: Readonly<{
  header: string;
  headerSec: string;
  lines: Array<{ label: string; value: string }>;
}>) {
  return (
    <div
      style={{
        flex: 1,
        border: "1pt solid #e5e5e5",
        borderRadius: "3pt",
        padding: "4pt",
      }}
    >
      <div style={{ fontSize: "8pt", fontWeight: "bold", color: "#0C6BA8", ...autoFont(header) }}>
        {header}
      </div>
      <div
        style={{
          fontSize: "7pt",
          color: "#888",
          marginBottom: "3pt",
          ...autoFont(headerSec),
        }}
      >
        {headerSec}
      </div>
      {lines.map((l, i) => (
        <div key={`${l.label}-${i}`} style={{ display: "flex", marginBottom: "1pt" }}>
          <span style={{ width: "60pt", fontSize: "7pt", color: "#888" }}>{l.label}</span>
          <span style={{ flex: 1, fontSize: "8pt", color: "#111", ...autoFont(l.value) }}>
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function tableTh(width?: number): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7.5pt",
    fontWeight: "bold",
    color: "#222",
    textAlign: "left",
    padding: "3pt 4pt",
    borderTop: "1pt solid #cccccc",
    borderBottom: "1pt solid #cccccc",
  };
}

function tableTd(width?: number): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "8pt",
    padding: "3pt 4pt",
    verticalAlign: "top",
  };
}

interface Props {
  payload: DeliveryReceiptPayload;
  printPageBreak?: boolean;
}

export function DeliveryReceiptPrint({
  payload,
  printPageBreak,
}: Readonly<Props>) {
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
