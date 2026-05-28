import { ko, type PdfMessages } from "./ko";
import { vi } from "./vi";
import { en } from "./en";
import { splitLangPair, type PdfLangPair } from "@/lib/pdf/types";

export const pdfMessages: Record<"ko" | "vi" | "en", PdfMessages> = { ko, vi, en };
export type { PdfMessages } from "./ko";

export function pickPdfMessages(locale: string | undefined): PdfMessages {
  if (locale === "ko" || locale === "vi" || locale === "en") return pdfMessages[locale];
  return pdfMessages.vi;
}

export interface PdfMessagePair {
  primary: PdfMessages;
  secondary: PdfMessages;
}

/** Resolve both message dictionaries for a bilingual document. */
export function pickPdfPair(pair: PdfLangPair): PdfMessagePair {
  const { primary, secondary } = splitLangPair(pair);
  return { primary: pdfMessages[primary], secondary: pdfMessages[secondary] };
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}
