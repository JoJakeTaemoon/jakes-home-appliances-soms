/**
 * One-shot script: render sample receipt PDFs (vi-ko, vi-en, ko-vi) to verify
 * the new dual-copy layout, tear-line, Payer/Payee 2-column grid, and natural-
 * language method.
 *
 *   npx tsx scripts/render-sample-receipt.ts
 *
 * Writes to `tmp/sample-receipt-{lang-pair}.pdf`. No DB access — uses a fixed
 * fake payload so the script runs without a populated database.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { registerFonts } from "../src/lib/pdf/fonts";
import { Receipt, type ReceiptPayload } from "../src/lib/pdf/templates/receipt";
import type { PdfLangPair } from "../src/lib/pdf/types";

const PAYLOAD: Omit<ReceiptPayload, "langPair"> = {
  receiptNumber: "RCPT-20260601-0001",
  paymentId: "cmckabcde1234567890fghij",
  customerName: "Nguyễn Văn An (응웬 반 안)",
  customerCode: "KH0042",
  customerType: "B2C",
  taxCode: null,
  address: "123 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
  contactName: "Trần Thị Hương",
  contactPhone: "0987-654-321",
  collectedAt: new Date("2026-06-01T10:30:00+07:00"),
  collectorName: "박기사 (Park Technician)",
  method: "BANK_TRANSFER",
  expectedAmount: 1_500_000,
  actualAmount: 1_500_000,
  carryoverAmount: 0,
  reference: null,
  notes: "정기 점검 후 1차 수금 / Thu lần 1 sau bảo trì định kỳ",
  hqPhone: "028-1234-5678",
  generatedAt: new Date("2026-06-01T10:35:00+07:00"),
};

const PAIRS: PdfLangPair[] = ["vi-ko", "vi-en"];

async function main() {
  registerFonts();
  const outDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(outDir, { recursive: true });

  for (const langPair of PAIRS) {
    const payload: ReceiptPayload = { ...PAYLOAD, langPair };
    const element = React.createElement(Receipt, { payload });
    const buf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
    const file = path.join(outDir, `sample-receipt-${langPair}.pdf`);
    await fs.writeFile(file, buf);
    console.log(`wrote ${file} (${buf.length} bytes)`);
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
