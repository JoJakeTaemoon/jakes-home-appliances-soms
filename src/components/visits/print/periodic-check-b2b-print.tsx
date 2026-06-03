/**
 * HTML print twin of the PERIODIC_CHECK_B2B PDF template.
 *
 * No prices — B2B invoicing happens via a separate tax invoice.
 * Multi-equipment table; the page is single A4 for ≤4 devices, two
 * sheets (1=customer copy, 2=company copy) for 5..10.
 */

import type { CSSProperties } from "react";
import type { PeriodicCheckB2bPayload } from "@/lib/pdf/visit-preview";
import {
  Bi,
  BrandHeader,
  PrintSheet,
  SignBox,
  TearLine,
  Watermark,
  autoFont,
  formatDate,
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

const LABELS: Record<"ko" | "vi" | "en", LabelDict> = {
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
    noPriceNotice: "* Phí dịch vụ phát hành riêng qua hoá đơn GTGT.",
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
  payload: PeriodicCheckB2bPayload;
  P: LabelDict;
  S: LabelDict;
  copyLabel: string;
}>) {
  return (
    <div style={COPY_BORDER}>
      <Watermark />
      <div style={{ position: "absolute", top: 6, right: 8, fontSize: "7.5pt", color: "#0C6BA8", fontWeight: "bold", zIndex: 1 }}>
        {copyLabel}
      </div>
      <BrandHeader hqPhone={payload.hqPhone} />

      <div style={{ fontSize: "13pt", fontWeight: "bold", textAlign: "center", ...autoFont(P.title) }}>
        {P.title}
      </div>
      <div style={{ fontSize: "8pt", color: "#555", textAlign: "center", marginBottom: "3pt", ...autoFont(S.title) }}>
        {S.title}
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
          {payload.customerTaxCode && (
            <div style={{ flex: 1 }}>
              <Line label={P.taxCode} value={payload.customerTaxCode} />
            </div>
          )}
        </div>
        {payload.siteName && (
          <Line
            label={P.site}
            value={payload.siteName + (payload.siteAddress ? ` — ${payload.siteAddress}` : "")}
          />
        )}
        {!payload.siteAddress && payload.customerAddress && (
          <Line label={P.address} value={payload.customerAddress} />
        )}
        {payload.recipientName && (
          <Line
            label={P.recipient}
            value={payload.recipientName + (payload.recipientTitle ? ` (${payload.recipientTitle})` : "")}
          />
        )}
      </div>

      <div style={CARD}>
        <SectionTitle P={P.equipmentList} S={S.equipmentList} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#f5f5f5" }}>
              <th style={th(18)}>{P.idx}</th>
              <th style={th()}>{P.loc}</th>
              <th style={th()}>{P.model}</th>
              <th style={th(70)}>{P.serial}</th>
              <th style={th()}>{P.work}</th>
              <th style={th()}>{P.notes}</th>
            </tr>
          </thead>
          <tbody>
            {payload.equipment.map((e, idx) => (
              <tr key={`${e.modelCode}-${idx}`} style={{ borderBottom: "0.5pt solid #eee" }}>
                <td style={td(18)}>{idx + 1}</td>
                <td style={{ ...td(), ...autoFont(e.location ?? "") }}>{e.location ?? "—"}</td>
                <td style={{ ...td(), ...autoFont(e.modelName) }}>
                  <div>{e.modelCode}</div>
                  <div style={{ color: "#777", fontSize: "6.5pt" }}>{e.modelName}</div>
                </td>
                <td style={td(70)}>{e.serialNumber ?? "—"}</td>
                <td style={{ ...td(), ...autoFont(e.workSummary) }}>{e.workSummary}</td>
                <td style={{ ...td(), ...autoFont(e.notes ?? "") }}>{e.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: "7pt", color: "#888", marginTop: "4pt", ...autoFont(P.noPriceNotice) }}>
        {P.noPriceNotice}
      </div>

      {payload.generalNotes && (
        <div style={{ marginTop: "4pt" }}>
          <Bi
            primary={`${P.notes}:`}
            secondary={S.notes}
            style={{ fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <div style={{ fontSize: "8pt", color: "#111", ...autoFont(payload.generalNotes) }}>
            {payload.generalNotes}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "16pt", marginTop: "auto", paddingTop: "8pt" }}>
        <SignBox primary={P.signCustomer} secondary={S.signCustomer} signerName={payload.recipientName} />
        <SignBox primary={P.signTechnician} secondary={S.signTechnician} signerName={payload.technicianName} />
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
      <span style={{ width: "70pt", fontSize: "7pt", color: "#888" }}>{label}</span>
      <span style={{ flex: 1, fontSize: "8pt", color: "#111", ...autoFont(value) }}>
        {value}
      </span>
    </div>
  );
}

function th(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7pt",
    fontWeight: "bold",
    color: "#222",
    textAlign: align ?? "left",
    padding: "3pt 4pt",
    borderTop: "0.7pt solid #bbb",
    borderBottom: "0.7pt solid #bbb",
  };
}

function td(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7.5pt",
    padding: "3pt 4pt",
    textAlign: align ?? "left",
    verticalAlign: "top",
  };
}

interface Props {
  payload: PeriodicCheckB2bPayload;
  printPageBreak?: boolean;
}

const SINGLE_PAGE_THRESHOLD = 4;

export function PeriodicCheckB2bPrint({ payload, printPageBreak }: Readonly<Props>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const singleSheet = payload.equipment.length <= SINGLE_PAGE_THRESHOLD;
  if (singleSheet) {
    return (
      <PrintSheet printPageBreak={printPageBreak}>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCustomer} />
        <TearLine primaryLabel={P.tearHere} secondaryLabel={S.tearHere} />
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCompany} />
      </PrintSheet>
    );
  }
  return (
    <>
      <PrintSheet printPageBreak>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCustomer} />
      </PrintSheet>
      <PrintSheet printPageBreak={printPageBreak}>
        <CopyBlock payload={payload} P={P} S={S} copyLabel={P.copyCompany} />
      </PrintSheet>
    </>
  );
}
