/**
 * HTML print twin of the SALE_RECEIPT_B2C PDF template.
 */

import type { CSSProperties } from "react";
import type { SaleReceiptPayload } from "@/lib/pdf/visit-preview";
import {
  Bi,
  BrandHeader,
  PrintSheet,
  SignBox,
  TearLine,
  Watermark,
  autoFont,
  formatDateTime,
  formatVnd,
  splitLangPair,
} from "./print-shared";

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

const LABELS: Record<"ko" | "vi" | "en", LabelDict> = {
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

function pickMethodKey(m: string): "methodCash" | "methodBank" | "methodCard" | "methodOther" {
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
        <MetaCell
          P={`${P.receiptNo}:`}
          S={S.receiptNo}
          value={payload.receiptNumber}
        />
        {payload.contractNumber && (
          <MetaCell
            P={`${P.contractNo}:`}
            S={S.contractNo}
            value={payload.contractNumber}
          />
        )}
        <MetaCell
          P={`${P.date}:`}
          S={S.date}
          value={formatDateTime(payload.saleDate)}
        />
      </div>

      <div style={{ display: "flex", gap: "6pt", marginBottom: "3pt" }}>
        <PartyBox
          header={P.buyer}
          headerSec={S.buyer}
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
          header={P.seller}
          headerSec={S.seller}
          lines={[
            { label: P.name, value: "SEOUL AQUA" },
            { label: P.contact, value: payload.technicianName },
            { label: P.phone, value: payload.hqPhone },
          ]}
        />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "4pt" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th style={th(20)}>{P.idx}</th>
            <th style={th()}>
              {P.model}
              <div style={subHead}>{S.model}</div>
            </th>
            <th style={th()}>
              {P.serial}
              <div style={subHead}>{S.serial}</div>
            </th>
            <th style={th(28, "right")}>{P.qty}</th>
            <th style={th(72, "right")}>{P.unitPrice}</th>
            <th style={th(88, "right")}>{P.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {payload.lines.map((l, idx) => {
            const total = l.unitPrice * l.quantity;
            return (
              <tr key={`${l.modelCode}-${idx}`} style={{ borderBottom: "0.5pt solid #eee" }}>
                <td style={td(20)}>{idx + 1}</td>
                <td style={td()}>
                  <div>{l.modelCode}</div>
                  <div style={{ color: "#666", fontSize: "7pt", ...autoFont(l.modelName) }}>
                    {l.modelName}
                  </div>
                </td>
                <td style={td()}>{l.serialNumber ?? "—"}</td>
                <td style={td(28, "right")}>{l.quantity}</td>
                <td style={td(72, "right")}>{formatVnd(l.unitPrice)}</td>
                <td style={td(88, "right")}>{formatVnd(total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1pt solid #0C6BA8", backgroundColor: "#F0F8FE" }}>
            <td style={td()} colSpan={4} />
            <td
              style={{
                ...td(72, "right"),
                fontSize: "10pt",
                fontWeight: "bold",
                color: "#0C6BA8",
              }}
            >
              <Bi
                primary={P.grandTotal}
                secondary={S.grandTotal}
                style={{ fontSize: "10pt", fontWeight: "bold", color: "#0C6BA8" }}
                subStyle={{ fontSize: "7pt", color: "#6AA4C8" }}
              />
            </td>
            <td
              style={{
                ...td(88, "right"),
                fontSize: "12pt",
                fontWeight: "bold",
                color: "#0C6BA8",
              }}
            >
              {formatVnd(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: "4pt" }}>
        <div style={{ display: "flex", marginBottom: "2pt" }}>
          <Bi
            primary={`${P.paymentMethod}:`}
            secondary={S.paymentMethod}
            style={{ width: "100pt", fontSize: "8pt", color: "#666" }}
            subStyle={{ fontSize: "7pt", color: "#999" }}
          />
          <span style={{ flex: 1, fontSize: "9pt", color: "#111", ...autoFont(`${P[methodKey]}${S[methodKey]}`) }}>
            {P[methodKey]} / {S[methodKey]}
          </span>
        </div>
        {payload.notes && (
          <div style={{ display: "flex" }}>
            <Bi
              primary={`${P.notes}:`}
              secondary={S.notes}
              style={{ width: "100pt", fontSize: "8pt", color: "#666" }}
              subStyle={{ fontSize: "7pt", color: "#999" }}
            />
            <span style={{ flex: 1, fontSize: "8pt", color: "#111", ...autoFont(payload.notes) }}>
              {payload.notes}
            </span>
          </div>
        )}
      </div>

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
      <span style={{ fontSize: "9pt", fontWeight: "bold" }}>{value}</span>
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
          <span style={{ width: "56pt", fontSize: "7pt", color: "#888" }}>{l.label}</span>
          <span style={{ flex: 1, fontSize: "8pt", color: "#111", ...autoFont(l.value) }}>
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const subHead: CSSProperties = {
  fontSize: "6.5pt",
  fontWeight: "normal",
  color: "#888",
};

function th(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7.5pt",
    fontWeight: "bold",
    color: "#222",
    textAlign: align ?? "left",
    padding: "3pt 4pt",
    borderTop: "1pt solid #cccccc",
    borderBottom: "1pt solid #cccccc",
  };
}

function td(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "8pt",
    padding: "3pt 4pt",
    textAlign: align ?? "left",
    verticalAlign: "top",
  };
}

interface Props {
  payload: SaleReceiptPayload;
  printPageBreak?: boolean;
}

export function SaleReceiptB2cPrint({ payload, printPageBreak }: Readonly<Props>) {
  const { primary, secondary } = splitLangPair(payload.langPair);
  const P = LABELS[primary];
  const S = LABELS[secondary];
  const grandTotal = payload.lines.reduce(
    (acc, l) => acc + l.unitPrice * l.quantity,
    0,
  );
  return (
    <PrintSheet printPageBreak={printPageBreak}>
      <CopyBlock payload={payload} P={P} S={S} grandTotal={grandTotal} copyLabel={P.copyCustomer} />
      <TearLine primaryLabel={P.tearHere} secondaryLabel={S.tearHere} />
      <CopyBlock payload={payload} P={P} S={S} grandTotal={grandTotal} copyLabel={P.copyCompany} />
    </PrintSheet>
  );
}
