/**
 * Disk-write helper for the manual contract-PDF upload override
 * (mirrors src/lib/tax-invoices/operations.ts:88-102).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

function getContractPdfDir(contractId: string): string {
  return path.join(process.cwd(), "uploads", "contracts", contractId);
}

export async function storeContractPdf(
  contractId: string,
  buffer: Buffer,
): Promise<{ storageKey: string; uploadedAt: Date }> {
  const dir = getContractPdfDir(contractId);
  await fsp.mkdir(dir, { recursive: true });
  const uploadedAt = new Date();
  const ts = uploadedAt.toISOString().replace(/[:.]/g, "-");
  const fullPath = path.join(dir, `${ts}-signed.pdf`);
  if (fs.existsSync(fullPath)) {
    // Extremely unlikely (same-millisecond collision) — archive rather than clobber.
    await fsp.mkdir(path.join(dir, "archive"), { recursive: true });
    await fsp.rename(fullPath, path.join(dir, "archive", `${ts}-signed.pdf`));
  }
  await fsp.writeFile(fullPath, buffer);
  const storageKey = path.relative(process.cwd(), fullPath);
  return { storageKey, uploadedAt };
}
