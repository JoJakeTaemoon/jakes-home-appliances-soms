/**
 * Shared primitives for the 6 visit-document HTML print components.
 *
 * The HTML print page (/o/{locale}/visits/print) renders one of these
 * per visit, stacked with `page-break-after: always`. Visual parity
 * with the matching @react-pdf templates is the goal — same layout,
 * same colors, same tear-off line, same watermark.
 *
 * All sizes are expressed in `pt` so they map cleanly to the PDF
 * counterparts and stay legible after the browser's print-to-A4 step.
 */

import type { CSSProperties, ReactNode } from "react";
import type { PdfLangPair } from "@/lib/pdf/types";

export type PrintLocale = "ko" | "vi" | "en";

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;

const VI_FONT_STACK =
  "'Be Vietnam Pro', 'Pretendard', 'Noto Sans KR', system-ui, sans-serif";
const KO_FONT_STACK =
  "'Noto Sans KR', 'Pretendard', 'Be Vietnam Pro', system-ui, sans-serif";

export function autoFont(s: string | null | undefined): CSSProperties {
  return s && HANGUL_RE.test(s)
    ? { fontFamily: KO_FONT_STACK }
    : { fontFamily: VI_FONT_STACK };
}

export function splitLangPair(p: PdfLangPair): {
  primary: PrintLocale;
  secondary: PrintLocale;
} {
  return p === "vi-en"
    ? { primary: "vi", secondary: "en" }
    : { primary: "vi", secondary: "ko" };
}

export function formatVnd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  const pad = (v: number) => (v < 10 ? `0${v}` : String(v));
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** Bilingual stacked label: primary on top, secondary beneath in smaller muted text. */
export function Bi({
  primary,
  secondary,
  style,
  subStyle,
}: Readonly<{
  primary: string;
  secondary: string;
  style?: CSSProperties;
  subStyle?: CSSProperties;
}>) {
  return (
    <span style={{ display: "inline-block", lineHeight: 1.1, ...style, ...autoFont(primary) }}>
      {primary}
      <br />
      <span style={{ lineHeight: 1.05, ...subStyle, ...autoFont(secondary) }}>{secondary}</span>
    </span>
  );
}

/** Brand header — single-line variant. SEOUL AQUA + legal name inline, contact info on the right. */
export function BrandHeader({ hqPhone }: Readonly<{ hqPhone: string }>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        borderBottom: "1pt solid #0C6BA8",
        paddingBottom: "2pt",
        marginBottom: "3pt",
        gap: "8pt",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "4pt", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "11pt", fontWeight: "bold", color: "#0C6BA8", whiteSpace: "nowrap" }}>
          SEOUL AQUA
        </span>
        <span style={{ fontSize: "6.5pt", color: "#666" }}>
          · CÔNG TY TNHH MTV TM&DV ĐẠI Á (Seoul Aqua)
        </span>
      </div>
      <div style={{ fontSize: "6.5pt", color: "#666", whiteSpace: "nowrap" }}>
        cs@seoulaqua.com.vn · {hqPhone}
      </div>
    </div>
  );
}

/**
 * Centered watermark logo. Drop one inside every CopyBlock — when a
 * sheet carries two copies separated by a tear-line, putting the
 * watermark inside each copy means both halves stay branded after the
 * customer tears the page in half.
 *
 * The parent must use `position: relative` (CopyBlocks already do via
 * COPY_BORDER) so the absolute layer fills the copy's box.
 */
export function Watermark() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.07,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* Public asset — Next.js serves /public verbatim. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo/seoul-aqua-logo.jpg"
        alt=""
        style={{ width: "200pt", height: "200pt", objectFit: "contain" }}
      />
    </div>
  );
}

/** Tear-off separator between customer / company copies. */
export function TearLine({
  primaryLabel,
  secondaryLabel,
}: Readonly<{ primaryLabel: string; secondaryLabel: string }>) {
  const text = `${primaryLabel} ✂ ${secondaryLabel}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: "8pt",
        margin: "0 8pt",
      }}
    >
      <div
        style={{
          flex: 1,
          borderBottom: "0.5pt dashed #999",
          alignSelf: "center",
        }}
      />
      <span
        style={{
          fontSize: "6.5pt",
          color: "#999",
          margin: "0 6pt",
          lineHeight: 1,
          ...autoFont(text),
        }}
      >
        {text}
      </span>
      <div
        style={{
          flex: 1,
          borderBottom: "0.5pt dashed #999",
          alignSelf: "center",
        }}
      />
    </div>
  );
}

/** Signature box (label primary + secondary + name). */
export function SignBox({
  primary,
  secondary,
  signerName,
}: Readonly<{ primary: string; secondary: string; signerName?: string | null }>) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ width: "100%", height: "22pt" }} />
      <div style={{ width: "100%", borderTop: "1pt solid #111", marginBottom: "2pt" }} />
      <div style={{ fontSize: "7pt", color: "#666", lineHeight: 1.1, ...autoFont(primary) }}>
        {primary}
      </div>
      <div style={{ fontSize: "6pt", color: "#999", lineHeight: 1.1, ...autoFont(secondary) }}>
        {secondary}
      </div>
      {signerName && (
        <div
          style={{
            fontSize: "7.5pt",
            fontWeight: "bold",
            marginTop: "1pt",
            ...autoFont(signerName),
          }}
        >
          {signerName}
        </div>
      )}
    </div>
  );
}

/**
 * Outer A4 sheet container.
 *
 * `printPageBreak` adds `pageBreakAfter: always` so the browser starts a
 * fresh A4 sheet after this block. Apply to every visit except the very
 * last one in the bundle.
 */
export function PrintSheet({
  children,
  printPageBreak = true,
}: Readonly<{ children: ReactNode; printPageBreak?: boolean }>) {
  return (
    <section
      className="print-sheet"
      style={{
        width: "210mm",
        minHeight: "297mm",
        height: "297mm",
        padding: "6mm",
        boxSizing: "border-box",
        position: "relative",
        backgroundColor: "white",
        color: "#111",
        fontSize: "9pt",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...autoFont("vi"),
        pageBreakAfter: printPageBreak ? "always" : "auto",
        breakAfter: printPageBreak ? "page" : "auto",
      }}
    >
      {children}
    </section>
  );
}
