/**
 * Contract code allocator.
 *
 * Formats (B.2 + B.5 confirmed 2026-05-26):
 *   - B2C original:    HD-YYYYmmDD/SA-KH##### (e.g. HD-20260526/SA-KH00001)
 *   - B2B original:    HD-YYYYmmDD/SA-{shortcode}  (e.g. HD-20260526/SA-SHV)
 *   - Amendments:      <parent code>-A{revision}     (e.g. HD-20260526/SA-SHV-A1)
 *
 * The date portion uses Vietnam Standard Time (UTC+7). The customer code or
 * shortcode itself uniquifies — we don't append a per-day sequence. If the
 * same customer happens to generate two contracts on the same date, the
 * resulting codes would collide; the DB `@unique` constraint catches this
 * and the caller should re-allocate after bumping the date forward by one
 * day (call site decision — `prepareRenewal` etc.). For the v1 happy path
 * this is a non-issue.
 *
 * Pure / deterministic. Pass a fixed `signedAt` for unit tests.
 */

export interface AllocateContractCodeInput {
  /** Required customer info — only the fields actually used by this function. */
  customer: {
    type: "B2C" | "B2B";
    code: string;       // KH##### — always set for both B2C and B2B
    shortcode?: string | null;
  };
  /** Required for original contracts. */
  type?: "SALE" | "RENTAL" | "MAINTENANCE";
  /** Used to derive the YYYYmmDD prefix (Vietnam time). Defaults to `new Date()`. */
  signedAt?: Date;
  /** When set, the returned code is `<parentCode>-A<revision>`. */
  parent?: {
    contractNumber: string;
    amendmentRevision: number;
  } | null;
}

const VST_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** Format a Date as `YYYYmmDD` in Vietnam Standard Time (UTC+7). */
export function formatVstDateStamp(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError("Invalid date for VST stamp");
  }
  const vst = new Date(d.getTime() + VST_OFFSET_MS);
  const y = vst.getUTCFullYear();
  const m = pad2(vst.getUTCMonth() + 1);
  const day = pad2(vst.getUTCDate());
  return `${y}${m}${day}`;
}

export interface ParsedContractCode {
  dateStamp: string;       // YYYYmmDD
  customerSuffix: string;  // KH##### or shortcode
  isAmendment: boolean;
  amendmentRevision: number; // 0 for originals
}

/** Strict parser — returns null on anything that doesn't match the expected shape. */
export function parseContractCode(code: string): ParsedContractCode | null {
  if (!code) return null;
  const trimmed = code.trim();
  const m = /^HD-(\d{8})\/SA-([A-Z0-9]+)(?:-A(\d+))?$/.exec(trimmed);
  if (!m) return null;
  const [, dateStamp, customerSuffix, rev] = m;
  return {
    dateStamp,
    customerSuffix,
    isAmendment: typeof rev === "string",
    amendmentRevision: rev ? Number.parseInt(rev, 10) : 0,
  };
}

/** Compose a contract code from parsed components — inverse of `parseContractCode`. */
export function formatContractCode(parts: ParsedContractCode): string {
  const base = `HD-${parts.dateStamp}/SA-${parts.customerSuffix}`;
  return parts.isAmendment && parts.amendmentRevision > 0
    ? `${base}-A${parts.amendmentRevision}`
    : base;
}

/**
 * Deterministic. Throws on invalid customer shape (e.g. B2B without shortcode).
 *
 * Examples:
 *   allocateContractCode({ customer: { type: "B2C", code: "KH00001" }, type: "SALE", signedAt })
 *     → "HD-20260526/SA-KH00001"
 *   allocateContractCode({ customer: { type: "B2B", code: "KH00002", shortcode: "SHV" }, type: "RENTAL", signedAt })
 *     → "HD-20260526/SA-SHV"
 *   allocateContractCode({
 *     customer: { type: "B2B", code: "KH00002", shortcode: "SHV" },
 *     parent: { contractNumber: "HD-20260526/SA-SHV", amendmentRevision: 0 },
 *   })
 *     → "HD-20260526/SA-SHV-A1"
 */
export function allocateContractCode(input: AllocateContractCodeInput): string {
  if (input.parent) {
    const parsed = parseContractCode(input.parent.contractNumber);
    if (!parsed) {
      throw new Error(`Parent contract code is malformed: ${input.parent.contractNumber}`);
    }
    const nextRev = (input.parent.amendmentRevision ?? 0) + 1;
    return formatContractCode({
      dateStamp: parsed.dateStamp,
      customerSuffix: parsed.customerSuffix,
      isAmendment: true,
      amendmentRevision: nextRev,
    });
  }

  const { customer, signedAt } = input;
  const dateStamp = formatVstDateStamp(signedAt ?? new Date());
  let suffix: string;
  if (customer.type === "B2B") {
    if (!customer.shortcode || !customer.shortcode.trim()) {
      throw new Error("B2B customer requires a shortcode to allocate contract code");
    }
    suffix = customer.shortcode.trim().toUpperCase();
  } else {
    if (!customer.code || !customer.code.trim()) {
      throw new Error("B2C customer requires a KH code to allocate contract code");
    }
    suffix = customer.code.trim().toUpperCase();
  }
  return `HD-${dateStamp}/SA-${suffix}`;
}
