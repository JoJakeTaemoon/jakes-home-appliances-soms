/**
 * HTML print twin of the WORK_CONFIRMATION PDF template.
 *
 * Layout (2026-06-03 redesign):
 *   - Brand header + doc title
 *   - 2-column row: Visit info | Customer info
 *   - Equipment card (full width)
 *   - Work performed (full width — wide block, free-text expands here)
 *   - Parts replaced (full width — chips)
 *   - Payment (optional)
 *   - Signature
 *
 * Two identical A4 sheets are emitted per visit (customer + company
 * copies). No copy label is printed — the operator stamps that manually.
 */

import type { CSSProperties } from "react";
import type { WorkConfPayload } from "@/lib/pdf/visit-preview";
import {
  Bi,
  PrintSheet,
  Watermark,
  autoFont,
  formatDateTime,
  formatVnd,
  splitLangPair,
} from "./print-shared";

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
  payment: string;
  paymentMethod: string;
  signature: string;
  none: string;
}

const LABELS: Record<"ko" | "vi" | "en", LabelDict> = {
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
    payment: "Số tiền đã thu",
    paymentMethod: "Phương thức",
    signature: "Chữ ký khách hàng",
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
    payment: "수금액",
    paymentMethod: "결제 방식",
    signature: "고객 서명",
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
    payment: "Amount collected",
    paymentMethod: "Method",
    signature: "Customer signature",
    none: "None",
  },
};

const CARD: CSSProperties = {
  border: "1pt solid #e5e5e5",
  borderRadius: "3pt",
  padding: "6pt",
};

function SectionHeader({ P, S }: Readonly<{ P: string; S: string }>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "4pt",
        borderBottom: "1pt solid #e5e5e5",
        paddingBottom: "1pt",
        marginBottom: "3pt",
      }}
    >
      <span
        style={{
          fontSize: "10pt",
          fontWeight: "bold",
          color: "#0C6BA8",
          ...autoFont(P),
        }}
      >
        {P}
      </span>
      <span
        style={{
          fontSize: "8pt",
          color: "#6AA4C8",
          ...autoFont(S),
        }}
      >
        / {S}
      </span>
    </div>
  );
}

function Row({ P, S, value }: Readonly<{ P: string; S: string; value: string }>) {
  return (
    <div style={{ display: "flex", marginBottom: "2pt" }}>
      <Bi
        primary={P}
        secondary={S}
        style={{ width: "70pt", fontSize: "8pt", color: "#666", lineHeight: 1.2 }}
        subStyle={{ fontSize: "7pt", color: "#999" }}
      />
      <span
        style={{
          flex: 1,
          fontSize: "8.5pt",
          color: "#111",
          ...autoFont(value),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SheetContent({
  payload,
  P,
  S,
  noneLine,
  showSite,
}: Readonly<{
  payload: WorkConfPayload;
  P: LabelDict;
  S: LabelDict;
  noneLine: string;
  showSite: boolean;
}>) {
  return (
    <>
      <Watermark />
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderBottom: "1.5pt solid #0C6BA8",
          paddingBottom: "3pt",
          marginBottom: "5pt",
          gap: "8pt",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "4pt", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "12pt", fontWeight: "bold", color: "#0C6BA8", whiteSpace: "nowrap" }}>
            SEOUL AQUA
          </span>
          <span style={{ fontSize: "7pt", color: "#666" }}>
            · CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)
          </span>
        </div>
        <div style={{ whiteSpace: "nowrap" }}>
          <span style={{ fontSize: "7.5pt", color: "#666", ...autoFont(`${P.visitNo}${S.visitNo}`) }}>
            {P.visitNo} / {S.visitNo}:{" "}
          </span>
          <span style={{ fontSize: "10pt", fontWeight: "bold" }}>
            {payload.visitNumber}
          </span>
        </div>
      </div>

      <div
        style={{
          fontSize: "15pt",
          fontWeight: "bold",
          textAlign: "center",
          ...autoFont(P.title),
          position: "relative",
          zIndex: 1,
        }}
      >
        {P.title}
      </div>
      <div
        style={{
          fontSize: "10pt",
          color: "#555",
          textAlign: "center",
          marginBottom: "8pt",
          ...autoFont(S.title),
          position: "relative",
          zIndex: 1,
        }}
      >
        {S.title}
      </div>

      {/* 2-column row: visit info | customer info */}
      <div style={{ display: "flex", gap: "6pt", position: "relative", zIndex: 1 }}>
        <div style={{ flex: 1, ...CARD }}>
          <SectionHeader P={P.visit} S={S.visit} />
          <Row P={P.visitType} S={S.visitType} value={payload.visitType} />
          <Row
            P={P.scheduledFor}
            S={S.scheduledFor}
            value={formatDateTime(payload.scheduledFor)}
          />
          <Row
            P={P.startedAt}
            S={S.startedAt}
            value={formatDateTime(payload.startedAt)}
          />
          <Row
            P={P.completedAt}
            S={S.completedAt}
            value={formatDateTime(payload.completedAt)}
          />
          <Row P={P.technician} S={S.technician} value={payload.technicianName} />
          {payload.collaboratorNames.length > 0 && (
            <Row
              P={P.collaborators}
              S={S.collaborators}
              value={payload.collaboratorNames.join(", ")}
            />
          )}
        </div>
        <div style={{ flex: 1, ...CARD }}>
          <SectionHeader P={P.customer} S={S.customer} />
          <Row P={P.customer} S={S.customer} value={payload.customerName} />
          <Row
            P={P.customerCode}
            S={S.customerCode}
            value={payload.customerCode}
          />
          {payload.customerType === "B2B" && payload.taxCode && (
            <Row P={P.taxCode} S={S.taxCode} value={payload.taxCode} />
          )}
          {showSite && payload.siteName && (
            <Row P={P.site} S={S.site} value={payload.siteName} />
          )}
          <Row P={P.address} S={S.address} value={payload.address || "—"} />
          {payload.contactName && (
            <Row
              P={P.contact}
              S={S.contact}
              value={
                payload.contactName +
                (payload.contactPhone ? ` · ${payload.contactPhone}` : "")
              }
            />
          )}
        </div>
      </div>

      {payload.equipment && (
        <div style={{ ...CARD, marginTop: "6pt", position: "relative", zIndex: 1 }}>
          <SectionHeader P={P.equipment} S={S.equipment} />
          <Row
            P={P.model}
            S={S.model}
            value={`${payload.equipment.modelCode} — ${payload.equipment.modelName}`}
          />
          <Row
            P={P.serial}
            S={S.serial}
            value={payload.equipment.serialNumber ?? "—"}
          />
        </div>
      )}

      {/* Wide work-performed block — primary canvas for tech free-text. */}
      <div
        style={{
          ...CARD,
          marginTop: "6pt",
          minHeight: "130pt",
          position: "relative",
          zIndex: 1,
        }}
      >
        <SectionHeader P={P.findings} S={S.findings} />
        <div
          style={{
            fontSize: "10pt",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            ...autoFont(payload.findings || noneLine),
          }}
        >
          {payload.findings || noneLine}
        </div>
      </div>

      {/* Wide parts-replaced block — chips, also room for tech to write. */}
      <div
        style={{
          ...CARD,
          marginTop: "6pt",
          minHeight: "70pt",
          position: "relative",
          zIndex: 1,
        }}
      >
        <SectionHeader P={P.partsReplaced} S={S.partsReplaced} />
        {payload.partsReplaced.length === 0 ? (
          <div style={{ fontSize: "9pt", color: "#777", ...autoFont(noneLine) }}>
            {noneLine}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", marginTop: "2pt" }}>
            {payload.partsReplaced.map((p, i) => (
              <span
                key={`${p}-${i}`}
                style={{
                  border: "1pt solid #0C6BA8",
                  borderRadius: "10pt",
                  padding: "1pt 6pt",
                  fontSize: "8.5pt",
                  color: "#0C6BA8",
                  marginRight: "4pt",
                  marginBottom: "3pt",
                  ...autoFont(p),
                }}
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {payload.collectedAmount !== null &&
        payload.collectedAmount !== undefined && (
          <div
            style={{
              ...CARD,
              marginTop: "6pt",
              position: "relative",
              zIndex: 1,
            }}
          >
            <SectionHeader P={P.payment} S={S.payment} />
            <Row
              P={P.payment}
              S={S.payment}
              value={formatVnd(payload.collectedAmount)}
            />
            {payload.paymentMethod && (
              <Row
                P={P.paymentMethod}
                S={S.paymentMethod}
                value={payload.paymentMethod}
              />
            )}
          </div>
        )}

      <div style={{ marginTop: "auto", paddingTop: "8pt", position: "relative", zIndex: 1 }}>
        <SectionHeader P={P.signature} S={S.signature} />
        <div
          style={{
            width: "200pt",
            height: "80pt",
            border: "1pt solid #111",
            marginTop: "4pt",
          }}
        />
      </div>
    </>
  );
}

interface Props {
  payload: WorkConfPayload;
  printPageBreak?: boolean;
}

export function WorkConfirmationPrint({
  payload,
  printPageBreak,
}: Readonly<Props>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const showSite = payload.customerType === "B2B";
  const noneLine = `${P.none} / ${S.none}`;
  return (
    <>
      <PrintSheet printPageBreak>
        <SheetContent
          payload={payload}
          P={P}
          S={S}
          noneLine={noneLine}
          showSite={showSite}
        />
      </PrintSheet>
      <PrintSheet printPageBreak={printPageBreak}>
        <SheetContent
          payload={payload}
          P={P}
          S={S}
          noneLine={noneLine}
          showSite={showSite}
        />
      </PrintSheet>
    </>
  );
}
