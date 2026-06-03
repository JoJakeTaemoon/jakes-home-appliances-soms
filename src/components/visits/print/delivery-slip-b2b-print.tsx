/**
 * HTML print twin of the DELIVERY_SLIP_B2B PDF template (Mẫu 02-VT).
 */

import type { CSSProperties } from "react";
import type { DeliverySlipB2bPayload } from "@/lib/pdf/visit-preview";
import {
  Bi,
  PrintSheet,
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
  formCode: string;
  formDecree: string;
  unitLabel: string;
  unitAddress: string;
  unitTaxCode: string;
  slipNo: string;
  date: string;
  recipientName: string;
  recipientUnit: string;
  recipientAddress: string;
  warehouse: string;
  reason: string;
  contractNo: string;
  idx: string;
  productName: string;
  productCode: string;
  unitOfMeasure: string;
  qty: string;
  unitPrice: string;
  amount: string;
  total: string;
  notes: string;
  signWriter: string;
  signReceiver: string;
  signWarehouse: string;
  signChiefAcct: string;
  signParen: string;
  tearHere: string;
}

const LABELS: Record<"ko" | "vi" | "en", LabelDict> = {
  vi: {
    title: "PHIẾU XUẤT KHO",
    copyCustomer: "Liên 2 — Giao khách hàng",
    copyCompany: "Liên 1 — Lưu nội bộ",
    formCode: "Mẫu số 02 - VT",
    formDecree: "(Ban hành theo QĐ số 48/2006/QĐ-BTC)",
    unitLabel: "Đơn vị",
    unitAddress: "Địa chỉ",
    unitTaxCode: "MST",
    slipNo: "Số",
    date: "Ngày",
    recipientName: "Họ tên người nhận hàng",
    recipientUnit: "Đơn vị nhận",
    recipientAddress: "Địa chỉ giao hàng",
    warehouse: "Xuất tại kho",
    reason: "Lý do xuất kho",
    contractNo: "Số HĐ",
    idx: "STT",
    productName: "Tên, nhãn hiệu, quy cách, phẩm chất vật tư",
    productCode: "Mã số",
    unitOfMeasure: "ĐVT",
    qty: "Số lượng",
    unitPrice: "Đơn giá",
    amount: "Thành tiền",
    total: "Cộng tiền hàng",
    notes: "Ghi chú",
    signWriter: "Người lập phiếu",
    signReceiver: "Người nhận hàng",
    signWarehouse: "Thủ kho",
    signChiefAcct: "Kế toán trưởng",
    signParen: "(Ký, họ tên)",
    tearHere: "CẮT DỌC THEO ĐƯỜNG NÀY",
  },
  ko: {
    title: "출고서 (B2B 납품)",
    copyCustomer: "사본 2 — 고객 인도",
    copyCompany: "사본 1 — 회사 보관",
    formCode: "양식 02-VT (베트남 정부 양식)",
    formDecree: "(재무부 QĐ 48/2006/QĐ-BTC)",
    unitLabel: "회사",
    unitAddress: "주소",
    unitTaxCode: "세금코드",
    slipNo: "번호",
    date: "발행일",
    recipientName: "수령자 성명",
    recipientUnit: "수령 회사",
    recipientAddress: "수령 주소",
    warehouse: "출고 창고",
    reason: "출고 사유",
    contractNo: "계약 번호",
    idx: "순번",
    productName: "품명·규격",
    productCode: "코드",
    unitOfMeasure: "단위",
    qty: "수량",
    unitPrice: "단가",
    amount: "금액",
    total: "합계",
    notes: "비고",
    signWriter: "인계자/작업자",
    signReceiver: "수령자",
    signWarehouse: "창고 책임자",
    signChiefAcct: "회계부장",
    signParen: "(서명·성명)",
    tearHere: "이 선을 따라 자르세요",
  },
  en: {
    title: "DELIVERY SLIP",
    copyCustomer: "Copy 2 — Customer",
    copyCompany: "Copy 1 — Company file",
    formCode: "Form 02-VT (VN MOF)",
    formDecree: "(Issued per QĐ 48/2006/QĐ-BTC)",
    unitLabel: "Company",
    unitAddress: "Address",
    unitTaxCode: "Tax code",
    slipNo: "No.",
    date: "Date",
    recipientName: "Recipient name",
    recipientUnit: "Recipient unit",
    recipientAddress: "Delivery address",
    warehouse: "Warehouse",
    reason: "Reason for issue",
    contractNo: "Contract no.",
    idx: "#",
    productName: "Product / spec / quality",
    productCode: "Code",
    unitOfMeasure: "UoM",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    total: "Total",
    notes: "Notes",
    signWriter: "Issuer",
    signReceiver: "Recipient",
    signWarehouse: "Warehouse keeper",
    signChiefAcct: "Chief accountant",
    signParen: "(Sign / name)",
    tearHere: "CUT ALONG THIS LINE",
  },
};

const COMPANY = {
  legalName: "CÔNG TY TNHH MTV TM&DV ĐẠI Á",
  brandName: "SEOUL AQUA",
  address: "TP. HCM, Việt Nam",
  taxCode: "0316XXXXXX",
};

const COPY_BORDER: CSSProperties = {
  border: "1pt solid #222",
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
  payload: DeliverySlipB2bPayload;
  P: LabelDict;
  S: LabelDict;
  copyLabel: string;
}>) {
  const recipientAddress = payload.siteAddress ?? payload.customerAddress;
  let grandTotal = 0;
  for (const l of payload.lines) {
    if (l.unitPrice !== null) grandTotal += l.unitPrice * l.quantity;
  }
  return (
    <div style={COPY_BORDER}>
      <Watermark />
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3pt" }}>
        <div>
          <div style={{ fontSize: "9pt", fontWeight: "bold" }}>{COMPANY.brandName}</div>
          <div style={{ fontSize: "8pt" }}>{COMPANY.legalName}</div>
          <div style={{ display: "flex", fontSize: "8pt", marginTop: "2pt" }}>
            <Bi
              primary={`${P.unitAddress}:`}
              secondary={S.unitAddress}
              style={{ width: "130pt", fontSize: "8pt", color: "#444" }}
              subStyle={{ fontSize: "7pt", color: "#888" }}
            />
            <span style={{ flex: 1, fontWeight: "bold" }}>{COMPANY.address}</span>
          </div>
          <div style={{ display: "flex", fontSize: "8pt" }}>
            <Bi
              primary={`${P.unitTaxCode}:`}
              secondary={S.unitTaxCode}
              style={{ width: "130pt", fontSize: "8pt", color: "#444" }}
              subStyle={{ fontSize: "7pt", color: "#888" }}
            />
            <span style={{ flex: 1, fontWeight: "bold" }}>{COMPANY.taxCode}</span>
          </div>
        </div>
        <div style={{ width: "200pt", textAlign: "right" }}>
          <div style={{ fontSize: "7.5pt" }}>{P.formCode}</div>
          <div style={{ fontSize: "7pt", color: "#666" }}>{P.formDecree}</div>
          <div style={{ fontSize: "7pt", color: "#666", ...autoFont(S.formCode) }}>
            {S.formCode}
          </div>
        </div>
      </div>

      <div style={{ fontSize: "14pt", fontWeight: "bold", textAlign: "center", marginTop: "4pt", ...autoFont(P.title) }}>
        {P.title}
      </div>
      <div style={{ fontSize: "9pt", color: "#555", textAlign: "center", marginBottom: "2pt", ...autoFont(S.title) }}>
        {S.title} · {copyLabel}
      </div>
      <div style={{ fontSize: "9pt", textAlign: "center", color: "#444", marginBottom: "3pt" }}>
        {P.date} {formatDate(payload.deliveryDate)} — {P.slipNo} {payload.slipNumber}
      </div>

      <div style={{ border: "0.7pt solid #bbb", padding: "6pt", marginBottom: "3pt" }}>
        <MetaRow P={`${P.recipientName}:`} S={S.recipientName}
          value={payload.recipientName + (payload.recipientTitle ? ` (${payload.recipientTitle})` : "")} />
        <MetaRow P={`${P.recipientUnit}:`} S={S.recipientUnit}
          value={`${payload.customerName} (${payload.customerCode})${payload.customerTaxCode ? ` · MST: ${payload.customerTaxCode}` : ""}`} />
        <MetaRow P={`${P.recipientAddress}:`} S={S.recipientAddress}
          value={(payload.siteName ? `${payload.siteName} — ` : "") + recipientAddress} />
        <MetaRow P={`${P.warehouse}:`} S={S.warehouse} value={payload.warehouse} />
        <MetaRow P={`${P.reason}:`} S={S.reason} value={payload.reason} />
        {payload.contractNumber && (
          <MetaRow P={`${P.contractNo}:`} S={S.contractNo} value={payload.contractNumber} />
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th style={th(22)}>{P.idx}</th>
            <th style={th()}>{P.productName}
              <div style={subHead}>{S.productName}</div>
            </th>
            <th style={th(70)}>{P.productCode}<div style={subHead}>{S.productCode}</div></th>
            <th style={th(36, "center")}>{P.unitOfMeasure}</th>
            <th style={th(38, "right")}>{P.qty}</th>
            <th style={th(70, "right")}>{P.unitPrice}</th>
            <th style={th(84, "right")}>{P.amount}</th>
          </tr>
        </thead>
        <tbody>
          {payload.lines.map((l, idx) => {
            const total = l.unitPrice !== null ? l.unitPrice * l.quantity : null;
            return (
              <tr key={`${l.modelCode}-${idx}`} style={{ borderBottom: "0.5pt solid #bbb" }}>
                <td style={td(22)}>{idx + 1}</td>
                <td style={td()}>
                  <div style={autoFont(l.modelName)}>{l.modelName}</div>
                  {l.serialNumber && (
                    <div style={{ fontSize: "7pt", color: "#666" }}>S/N: {l.serialNumber}</div>
                  )}
                </td>
                <td style={td(70)}>{l.modelCode}</td>
                <td style={td(36, "center")}>{l.unit}</td>
                <td style={td(38, "right")}>{l.quantity}</td>
                <td style={td(70, "right")}>{formatVnd(l.unitPrice)}</td>
                <td style={td(84, "right")}>{formatVnd(total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1pt solid #222" }}>
            <td colSpan={6} style={td(undefined, "left")}>
              <Bi
                primary={P.total}
                secondary={S.total}
                style={{ fontSize: "9pt", fontWeight: "bold" }}
                subStyle={{ fontSize: "7pt", color: "#666" }}
              />
            </td>
            <td style={{ ...td(84, "right"), fontSize: "9pt", fontWeight: "bold" }}>
              {formatVnd(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>

      {payload.notes && (
        <div style={{ marginTop: "4pt", marginBottom: "6pt" }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: "6pt" }}>
        <SignSlot P={P.signWriter} S={S.signWriter} paren={P.signParen} signer={payload.technicianName} />
        <SignSlot P={P.signReceiver} S={S.signReceiver} paren={P.signParen} signer={payload.recipientName} />
        <SignSlot P={P.signWarehouse} S={S.signWarehouse} paren={P.signParen} />
        <SignSlot P={P.signChiefAcct} S={S.signChiefAcct} paren={P.signParen} />
      </div>
    </div>
  );
}

function MetaRow({ P, S, value }: Readonly<{ P: string; S: string; value: string }>) {
  return (
    <div style={{ display: "flex", marginBottom: "2pt" }}>
      <Bi
        primary={P}
        secondary={S}
        style={{ width: "130pt", fontSize: "8pt", color: "#444" }}
        subStyle={{ fontSize: "7pt", color: "#888" }}
      />
      <span style={{ flex: 1, fontSize: "8.5pt", color: "#111", fontWeight: "bold", ...autoFont(value) }}>
        {value}
      </span>
    </div>
  );
}

function SignSlot({
  P,
  S,
  paren,
  signer,
}: Readonly<{ P: string; S: string; paren: string; signer?: string | null }>) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "0 2pt" }}>
      <div style={{ fontSize: "7.5pt", fontWeight: "bold", ...autoFont(P) }}>{P}</div>
      <div style={{ fontSize: "6.5pt", color: "#888", ...autoFont(S) }}>{S}</div>
      <div style={{ fontSize: "6.5pt", color: "#777", marginBottom: "3pt" }}>{paren}</div>
      <div style={{ width: "100%", height: "36pt" }} />
      <div style={{ fontSize: "7pt", color: "#666", ...autoFont(signer ?? "") }}>{signer ?? " "}</div>
    </div>
  );
}

const subHead: CSSProperties = {
  fontSize: "6.5pt",
  fontWeight: "normal",
  color: "#666",
};

function th(width?: number, align?: "left" | "right" | "center"): CSSProperties {
  return {
    width: width ? `${width}pt` : undefined,
    fontSize: "7.5pt",
    fontWeight: "bold",
    color: "#222",
    textAlign: align ?? "left",
    padding: "3pt 4pt",
    borderTop: "1pt solid #222",
    borderBottom: "1pt solid #222",
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
  payload: DeliverySlipB2bPayload;
  printPageBreak?: boolean;
}

export function DeliverySlipB2bPrint({ payload, printPageBreak }: Readonly<Props>) {
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
