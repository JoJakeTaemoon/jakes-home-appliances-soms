/**
 * Legacy DBF → SOMS migration package.
 *
 *   npx tsx scripts/legacy-dbf/convert.ts <dbf-dir> <out-dir> \
 *     [--existing <migration-export.xml>] [--catalog <catalog-export.csv>]
 *
 * For a database that already holds data (production), pass what it holds:
 *   --existing  the 데이터 이관 → 내보내기 workbook. B2B shortcodes already in
 *               use are avoided (the importer does not check them, and a
 *               clash fails that file's whole commit), and customers whose
 *               name matches one already there are listed for a person to
 *               look at before committing.
 *   --catalog   the 제품 카탈로그 → CSV 내보내기 file. A 제품군 that already
 *               exists under the same Korean name (spaces ignored) is reused
 *               verbatim, so the import does not create a near-duplicate.
 *   --mapping   a folder with model-map.csv / filter-map.csv (legacy,prod).
 *               A legacy model mapped to a catalog model attaches its units
 *               to that model (by its model code) and is not written to the
 *               catalog again; a mapped filter is written as the catalog SKU.
 *               An empty `prod` cell means "add the legacy one as new".
 *
 * Reads the previous program's dBase tables (CP949 text, Clipper/SIx files)
 * and writes three files:
 *
 *   catalog.csv     — upload first on 제품 카탈로그 → CSV 가져오기. Models,
 *                     filters and which filters each model takes.
 *   migration-NN.xml — then upload each on 시스템 관리 → 데이터 이관. The same
 *                     workbook shape as the template.
 *   report.md       — counts, every value that had to be repaired, and the
 *                     assumptions a person should confirm.
 *
 * Tables used (field meanings were pinned by matching the program's own CSV
 * exports against the raw rows — see docs/LEGACY_DBF_MAPPING.md):
 *   WWM      one row per installed unit, with its customer's name/address
 *   WWPAN    sale type (rent/main/sale/Huy=cancelled/Mat=lost), sale + end date
 *   WWINF    sale amount for outright sales
 *   SLCMS    billing member: monthly fee, debit window, payer phone
 *   M{yyyymm} monthly billing snapshot — the newest one is the current fee
 *   WWS      per-unit filter slots: filter, cycle, last replaced
 *   SLCMSP   collected payments — carried over as closed history, so a month
 *            the customer already paid is not billed again after cutover
 *   WWHIS    filter-change history — the real last-replaced dates; WWS's own
 *            dates stopped being kept up years ago
 *   WWFILTER / WWMODEL / WWG   filter list, model list, model ↔ filter links
 *
 * The old program keeps one row per unit, so a company with 198 dispensers is
 * 198 customer rows. Rows are grouped back into one customer here: companies
 * by name, households by name plus a shared phone or address (two different
 * people called "Chi Ngan" must stay two customers).
 *
 * ponytail: one-off cutover tool, not app code. Rerun it against a fresh copy
 * of the DBF folder at cutover; it holds no state.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSpreadsheetML } from "@/lib/xlsx/spreadsheet-ml";
import { readWorkbook, sheetToRecords } from "@/lib/xlsx/read-workbook";
import { HEADERS, SHEETS } from "@/lib/migration/plan";
import divisions from "@/data/vn-administrative-divisions.json";

type Row = Record<string, string>;

// ── DBF reading ──────────────────────────────────────────────────────────

const cp949 = new TextDecoder("euc-kr"); // WHATWG euc-kr is Windows-949

function readDbf(path: string): Row[] {
  const b = readFileSync(path);
  const count = b.readUInt32LE(4);
  const headerLen = b.readUInt16LE(8);
  const recordLen = b.readUInt16LE(10);
  const fields: { name: string; offset: number; len: number }[] = [];
  let offset = 1; // byte 0 of each record is the deletion flag
  for (let p = 32; p < headerLen && b[p] !== 0x0d; p += 32) {
    const name = b.toString("latin1", p, p + 11).replace(/\0.*$/, "");
    const len = b[p + 16];
    fields.push({ name, offset, len });
    offset += len;
  }
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const start = headerLen + i * recordLen;
    if (start + recordLen > b.length) break;
    if (b[start] === 0x2a) continue; // '*' — deleted
    const row: Row = {};
    for (const f of fields) {
      row[f.name] = cp949.decode(b.subarray(start + f.offset, start + f.offset + f.len)).trim();
    }
    rows.push(row);
  }
  return rows;
}

// ── Value repair ─────────────────────────────────────────────────────────

const fixes = new Map<string, { count: number; examples: string[] }>();
function noteFix(kind: string, example: string): void {
  const f = fixes.get(kind) ?? { count: 0, examples: [] };
  f.count += 1;
  if (f.examples.length < 5) f.examples.push(example);
  fixes.set(kind, f);
}

const TODAY = new Date();
const MAX_YEAR = TODAY.getUTCFullYear() + 1;

/** `YYYY.MM.DD` → ISO, or null when it cannot be a real date. A day past the
 *  end of its month is pulled back to the last day rather than discarded. */
function legacyDate(raw: string | undefined, label: string): string | null {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec((raw ?? "").trim());
  if (!m) {
    if (raw && raw.replace(/[ .]/g, "") !== "") noteFix(`${label}: 읽을 수 없는 날짜 → 다른 출처 사용`, raw);
    return null;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1995 || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1) {
    noteFix(`${label}: 불가능한 날짜 → 다른 출처 사용`, raw!);
    return null;
  }
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > last) noteFix(`${label}: 말일을 넘는 날짜 → 말일로`, raw!);
  return `${y}-${String(mo).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** `YYYY.MM` → months since year 0, for term arithmetic. */
function monthIndex(raw: string | undefined): number | null {
  const m = /^(\d{4})\.(\d{2})$/.exec((raw ?? "").trim());
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}

/** Older members are billed in USD (`17` = 17 USD a month, confirmed by the
 *  client 2026-10-20). SOMS amounts are VND, so a USD figure is kept out of
 *  the amount column and written into the notes for staff to convert. */
function money(raw: string | undefined, label: string, usd: string[]): number | null {
  const n = Number((raw ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 10_000) {
    noteFix(`${label}: USD 금액 → 금액 칸 비우고 메모`, String(n));
    usd.push(`${label} USD ${n}`);
    return null;
  }
  return n;
}

// Vietnam moved 11-digit mobiles to 10 digits in 2018. Old numbers no longer
// receive SMS, so they are rewritten. Landlines changed too (08 → 028 …), but
// an old landline cannot be told apart from a new 08x mobile, so they stay.
const OLD_MOBILE: Record<string, string> = {
  "0120": "070", "0121": "079", "0122": "077", "0126": "076", "0128": "078",
  "0123": "083", "0124": "084", "0125": "085", "0127": "081", "0129": "082",
  "0162": "032", "0163": "033", "0164": "034", "0165": "035", "0166": "036",
  "0167": "037", "0168": "038", "0169": "039", "0186": "056", "0188": "058",
  "0199": "059",
};
function phone(raw: string | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  const now = d.length === 11 ? OLD_MOBILE[d.slice(0, 4)] : undefined;
  if (now) {
    noteFix("옛 11자리 휴대폰 → 2018년 개편 번호", `${d}→${now}${d.slice(4)}`);
    d = now + d.slice(4);
  }
  return d.length >= 9 && d.length <= 11 ? d : null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const ascii = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "D").toUpperCase();
const hasHangul = (s: string) => /[가-힣]/.test(s);

// ── Region → 2025 province ──────────────────────────────────────────────

// Legacy region tags, mapped onto the 34 provinces left after the 2025
// merger (Binh Duong + Vung Tau → HCMC, Long An → Tay Ninh, …). Tags that
// could mean two places (QN, BT, DL, DM) are left blank on purpose.
const REGION: Record<string, string> = {
  HCMC: "HCM", "HCM CITY": "HCM", HCM: "HCM", "CU CHI": "HCM", CITY: "HCM",
  BD: "HCM", VT: "HCM",
  DN: "DNI", BP: "DNI", BH: "DNI",
  LA: "TN", "L.A": "TN", TN: "TN",
  TG: "DT", DT: "DT",
  QNGAI: "QNG", "Q.NGAI": "QNG",
  QNAM: "DN", QN: "DN", // QN = Quảng Nam, now part of Đà Nẵng (client 2026-10-20)
  BTRE: "VL", VL: "VL",
  HN: "HN", HP: "HP", HY: "HY", BNINH: "BN", BN: "BN",
  CT: "CT", CANTHO: "CT", ST: "CT", SOCTRANG: "CT", HG: "CT",
  KG: "AG", RG: "AG", AG: "AG",
  BTHUAN: "LDG", LD: "LDG",
  NT: "KH", KH: "KH",
};
const provinceName = new Map(
  (divisions as { provinces: { code: string; name: string }[] }).provinces.map((p) => [p.code, p.name]),
);
const unmappedRegions = new Map<string, number>();
function province(tag: string): string | null {
  const t = tag.trim().toUpperCase();
  if (!t) return null;
  const code = REGION[t];
  if (!code) {
    unmappedRegions.set(t, (unmappedRegions.get(t) ?? 0) + 1);
    return null;
  }
  return provinceName.get(code) ?? null;
}

// ── Load ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const existingPath = flag("--existing");
const catalogPath = flag("--catalog");
const mappingDir = flag("--mapping");
const [dir, outDir] = argv;
if (!dir || !outDir) {
  console.error(
    "usage: tsx scripts/legacy-dbf/convert.ts <dbf-dir> <out-dir> [--existing <migration-export.xml>] [--catalog <catalog-export.csv>]",
  );
  process.exit(1);
}

/** Minimal RFC 4180 reader for the catalog export (quoted cells, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Legacy → catalog mapping decided by a person (optional).
const readMap = (file: string) =>
  new Map(
    readFileSync(join(mappingDir!, file), "utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((line) => parseCsv(line)[0])
      .filter((r) => r[1]?.trim())
      .map((r) => [r[0], r[1].trim()] as const),
  );
const modelMap = mappingDir ? readMap("model-map.csv") : new Map<string, string>();
const filterMap = mappingDir ? readMap("filter-map.csv") : new Map<string, string>();

// What the target database already holds (both optional).
const existingCustomers = existingPath
  ? sheetToRecords(readWorkbook(readFileSync(existingPath)).Customers ?? [])
  : [];
const existingCategories = new Map<string, string[]>(); // nameKo → [EN, KO, VI]
if (catalogPath) {
  const [head, ...body] = parseCsv(readFileSync(catalogPath, "utf8").replace(/^\uFEFF/, ""));
  const col = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n);
  const [en, ko, vi] = [col("category (en)"), col("category (ko)"), col("category (vi)")];
  for (const r of body) {
    // A model in several 제품군 writes "A | B" in each cell, positionally aligned.
    const kos = (r[ko] ?? "").split("|").map((x) => x.trim());
    kos.forEach((k, i) => {
      if (k) existingCategories.set(k.replace(/\s+/g, ""), [r[en].split("|")[i].trim(), k, r[vi].split("|")[i].trim()]);
    });
  }
}
const load = (name: string) => readDbf(join(dir, `${name}.DBF`));
const byKey = (rows: Row[], key: string) => {
  const m = new Map<string, Row>();
  for (const r of rows) if (r[key] && !m.has(r[key])) m.set(r[key], r);
  return m;
};

const wwm = load("WWM");
const pan = byKey(load("WWPAN"), "WWPAN01");
const inf = byKey(load("WWINF"), "WWINF02");
const cms = byKey(load("SLCMS"), "SLCMS01");
const slots = byKey(load("WWS"), "WWS01");
const collections = load("SLCMSP");
const filters = load("WWFILTER");
const modelLinks = load("WWG");
const legacyModels = load("WWMODEL");

// The newest monthly billing file not in the future holds the current fee.
const thisMonth = `${TODAY.getUTCFullYear()}${String(TODAY.getUTCMonth() + 1).padStart(2, "0")}`;
const billingFile = readdirSync(dir)
  .map((f) => /^M(\d{6})\.DBF$/i.exec(f)?.[1])
  .filter((m): m is string => !!m && m <= thisMonth)
  .sort()
  .reverse()
  .find((m) => readDbf(join(dir, `M${m}.DBF`)).length > 0)!;
const billing = byKey(readDbf(join(dir, `M${billingFile}.DBF`)), "BCMS01");

// Filter SKUs: the short name, made unique — the old list reuses 프리 / 헤파 /
// 탈취 etc. for different parts, keyed apart only by their internal id.
const INSPECTION_ID = filters.find((f) => f.WWFILTER01 === "점검")?.WWFILTER00 ?? "";
const skuById = new Map<string, { sku: string; name: string; cycleDays: number | null }>();
{
  const used = new Map<string, number>();
  for (const f of filters) {
    if (f.WWFILTER00 === INSPECTION_ID || !f.WWFILTER01) continue;
    const n = (used.get(f.WWFILTER01) ?? 0) + 1;
    used.set(f.WWFILTER01, n);
    const raw = Number(f.WWFILTER05) || 0;
    skuById.set(f.WWFILTER00, {
      sku: n === 1 ? f.WWFILTER01 : `${f.WWFILTER01}-${n}`,
      name: f.WWFILTER06 || f.WWFILTER01,
      cycleDays: raw > 0 ? (f.WWFILTER09 === "M" ? raw * 30 : raw) : null,
    });
  }
}

// The newest change of each filter on each unit, from WWHIS. About 71k of its
// rows sit shifted by a few bytes (a damaged block), so rows are found by
// content rather than offset — <관리번호><YYYY.MM.DD> … 교환 … <filter id>
// <customer id> — and kept only when the 관리번호 is that customer's own,
// which no stray match survives.
const lastChange = new Map<string, string>(); // `${mgmt}|${filterId}` → ISO
{
  const mgmtOf = new Map(wwm.map((r) => [r.SLM00, r.SLM05]));
  const raw = readFileSync(join(dir, "WWHIS.DBF")).toString("latin1");
  const CHANGE = "\xb1\xb3\xc8\xaf"; // 교환 in CP949
  const anchor = /(\d{1,5})((?:19|20)\d\d)\.(\d\d)\.(\d\d)/g;
  for (let m; (m = anchor.exec(raw)); ) {
    const tail = raw.slice(anchor.lastIndex, anchor.lastIndex + 260);
    if (!tail.slice(0, 40).includes(CHANGE)) continue;
    const ids = /(\d{6}-\d{9})(\d{6}-\d{9})/.exec(tail);
    if (!ids || mgmtOf.get(ids[2]) !== m[1]) continue;
    const [y, mo, d] = [Number(m[2]), Number(m[3]), Number(m[4])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y > MAX_YEAR) continue;
    const iso = `${m[2]}-${m[3]}-${m[4]}`;
    const key = `${m[1]}|${ids[1]}`;
    if (iso > (lastChange.get(key) ?? "")) lastChange.set(key, iso);
  }
}

// ── Units ────────────────────────────────────────────────────────────────

type ServiceType = "RENTAL" | "MAINTENANCE" | "SALE";
type UnitStatus = "active" | "terminated" | "lost";

interface Unit {
  mgmt: string;
  legacyId: string;
  name: string;
  b2b: boolean;
  phones: string[];
  contactTitle: string | null;
  street: string | null;
  province: string | null;
  region: string;
  staff: string;
  referral: string;
  invoice: string;
  model: string;
  saleType: string;
  serviceType: ServiceType;
  status: UnitStatus;
  /** Active unit whose rental term has run out: contract COMPLETED. */
  rentalOver: boolean;
  start: string;
  end: string | null;
  termMonths: number | null;
  fee: number | null;
  deposit: number | null;
  saleAmount: number | null;
  inspectionDays: number | null;
  consumables: { sku: string | null; customName: string | null; qty: number; days: number | null; last: string | null }[];
  notes: string;
  payment: string;
  usd: string[];
  /** 출금일 1–31, the day the monthly fee is collected. */
  billingDay: number | null;
  /** How this member pays: CASH (방문수금) or BANK_TRANSFER (자동이체). */
  payMethod: "CASH" | "BANK_TRANSFER";
}

const units: Unit[] = [];
for (const r of wwm) {
  const mgmt = r.SLM05;
  if (!/^\d+$/.test(mgmt)) continue;
  const p = pan.get(mgmt) ?? {};
  const k = cms.get(mgmt) ?? {};
  const s = inf.get(mgmt) ?? {};
  const bill = billing.get(mgmt);

  const saleType = (p.WWPAN04 || s.WWINF01 || "").trim();
  const lost = saleType === "Mat" || /^MAT(MAY|NAY)$/.test(r.WWM09);
  const status: UnitStatus = lost
    ? "lost"
    : r.WWM12 === "해지" || saleType === "Huy"
      ? "terminated"
      : r.WWM12 === "승인"
        ? "active"
        : bill // no approval flag: still billed this month means still served
          ? "active"
          : "terminated";

  const typeOf = (t: string): ServiceType | null =>
    /^(rent|임대|thue)/i.test(t) ? "RENTAL"
    : /^(main|free|khac)/i.test(t) ? "MAINTENANCE"
    : /^(sale|팔매)/i.test(t) ? "SALE"
    : null;
  // A cancelled or lost unit no longer says what it was; the billing record does.
  const serviceType = typeOf(saleType) ?? typeOf(k.SLCMS12 ?? "") ?? "MAINTENANCE";
  if (!typeOf(saleType)) noteFix("판매방식 없음(Huy/Mat/공란) → 수금 기록·기본값으로 유형 추정", `${mgmt}:${saleType || "공란"}→${serviceType}`);

  const start =
    legacyDate(p.WWPAN11, "판매일자") ??
    legacyDate(s.WWINF04, "판매정보 일자") ??
    legacyDate(r.WWM02, "등록일자") ??
    legacyDate(k.SLCMS11, "수금 시작일");
  if (!start) {
    noteFix("날짜 출처가 모두 비어 있음 → 등록 연도 1월 1일", mgmt);
  }
  const startIso = start ?? `${(r.WWM02.match(/^\d{4}/)?.[0] ?? "2014")}-01-01`;

  let end = legacyDate(p.WWPAN12, "마감일자");
  if (end && end <= startIso) end = null;
  const debitFrom = monthIndex(k.SLCMS31);
  const debitTo = monthIndex(k.SLCMS32);
  if (!end && status !== "active" && debitTo && k.SLCMS32 < "2090") {
    end = `${k.SLCMS32.replace(".", "-")}-01`;
    if (end <= startIso) end = null;
  }

  let termMonths: number | null = null;
  if (serviceType === "RENTAL") {
    const span = debitFrom !== null && debitTo !== null ? debitTo - debitFrom : null;
    termMonths = span && span > 0 && span <= 120 ? span : 36;
  }

  // The old program leaves a rental 승인 after its term runs out — the unit
  // now belongs to the customer and is only serviced. Importing it as a live
  // rental would have the rental-completion job close ~700 contracts (and
  // notify every customer) the night after cutover, so close it here.
  let rentalOver = false;
  if (status === "active" && serviceType === "RENTAL") {
    const termEnd = new Date(`${startIso}T00:00:00Z`);
    termEnd.setUTCMonth(termEnd.getUTCMonth() + (termMonths ?? 36));
    const rentalEnd = end ?? termEnd.toISOString().slice(0, 10);
    if (rentalEnd <= TODAY.toISOString().slice(0, 10)) {
      rentalOver = true;
      end = rentalEnd;
      noteFix("임대 기간이 끝난 '승인' 장비 → 계약 COMPLETED (소유권 고객)", `${mgmt}:${startIso}~${rentalEnd}`);
    }
  }

  const phones = [r.SLM12, r.SLM13, p.WWPAN62, p.WWPAN61, k.SLCMS53]
    .map(phone)
    .filter((x): x is string => !!x);

  const title = (r.SLM24 ?? "").trim();
  const contactTitle = /[A-Za-z가-힣].*[A-Za-z가-힣]/.test(title) && !/^\(/.test(title) ? squash(title) : null;

  // Filter slots 1–9: WWS2n = filter id, WWS1n = qty, WWM6n = cycle,
  // WWS8n = last replaced. The 점검 pseudo-filter is the inspection cycle.
  const consumables: Unit["consumables"] = [];
  let inspectionDays: number | null = null;
  const slot = slots.get(mgmt);
  if (slot) {
    for (let i = 1; i <= 9; i++) {
      const fid = slot[`WWS2${i}`];
      const label = slot[`WWM5${i}`];
      if (!fid && !label) continue;
      const days = Number(slot[`WWM6${i}`]) || null;
      if (fid === INSPECTION_ID || label === "점검") {
        inspectionDays = days;
        continue;
      }
      const f = skuById.get(fid);
      const slotDate = legacyDate(slot[`WWS8${i}`], "필터 최근교환일");
      const historyDate = lastChange.get(`${mgmt}|${fid}`) ?? null;
      if (historyDate && historyDate > (slotDate ?? "")) noteFix("필터 최근교환일 → 교환 이력(WWHIS)의 더 최근 날짜", `${mgmt}:${slotDate ?? "없음"}→${historyDate}`);
      consumables.push({
        sku: f?.sku ?? null,
        customName: f ? null : label || fid,
        qty: Number(slot[`WWS1${i}`]) || 1,
        days: days ?? f?.cycleDays ?? null,
        last: [slotDate, historyDate].filter((x): x is string => !!x).sort().at(-1) ?? null,
      });
    }
  }

  const name = squash(r.SLM01) || squash(p.WWPAN03 ?? "") || squash(k.SLCMS03 ?? "");
  if (!r.SLM01.trim()) noteFix("고객명 공란 → 판매/수금 기록 이름 또는 관리번호", `${mgmt}→${name || `고객 ${mgmt}`}`);

  const debitDay = (bill?.BCMS06 || k.SLCMS06 || "").replace(/^0+/, "");
  const usd: string[] = [];
  const payer = k.SLCMS02 ? `납부자번호 ${k.SLCMS02}` : "";
  const method = (bill?.BCMS51 || k.SLCMS51) === "1" ? "자동이체" : (bill || k.SLCMS01) ? "방문수금" : "";

  units.push({
    mgmt,
    legacyId: r.SLM00,
    name: name || `고객 ${mgmt}`,
    b2b: r.SLM04 === "회사",
    phones,
    contactTitle,
    street: squash(`${r.SLM32}${r.SLM33}`) || null,
    province: province(r.WWM16),
    region: r.WWM16,
    staff: r.WWM11,
    referral: r.WWM08,
    invoice: r.WWM15,
    model: squash(r.WWM03),
    saleType,
    serviceType,
    status,
    start: startIso,
    end,
    rentalOver,
    termMonths,
    fee: serviceType === "SALE" ? null : money(bill?.BCMS07 || k.SLCMS07, "월납입액", usd),
    deposit: serviceType === "RENTAL" ? money(p.WWPAN17, "보증금", usd) : null,
    saleAmount: serviceType === "SALE" ? money(s.WWINF22 || s.WWINF09, "판매금액", usd) : null,
    inspectionDays,
    // Consumables matter only for a unit that is still serviced.
    consumables: status === "active" ? consumables : [],
    notes: [
      `이전 관리번호 ${mgmt}`,
      `고유번호 ${r.SLM00}`,
      saleType && `판매방식 ${saleType}`,
      status === "lost" && "분실",
      r.WWM17 && `제품번호 ${r.WWM17}`,
      r.WWM09 && `구분 ${r.WWM09}`,
      r.WWM18 && `약도 ${r.WWM18}`,
      r.WWM19 && `참고 ${r.WWM19}`,
    ].filter(Boolean).join(" · "),
    payment: [debitDay && `출금일 매월 ${debitDay}일`, method, payer].filter(Boolean).join(" · "),
    billingDay: Number(debitDay) >= 1 && Number(debitDay) <= 31 ? Number(debitDay) : null,
    payMethod: (bill?.BCMS51 || k.SLCMS51) === "1" ? "BANK_TRANSFER" : "CASH",
    usd,
  });
}

// ── Group units into customers ───────────────────────────────────────────

const parent = units.map((_, i) => i);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const union = (a: number, b: number) => { parent[find(a)] = find(b); };
// A household row carrying a company's exact name is that company entered
// with the wrong 고객분류 (e.g. one TAEKWANG VINA unit filed as 가정집).
const companyNames = new Set(units.filter((u) => u.b2b).map((u) => norm(u.name)));
for (const u of units) {
  if (!u.b2b && norm(u.name).length >= 4 && companyNames.has(norm(u.name))) {
    noteFix("가정집으로 입력된 회사 행 → 같은 이름의 회사 고객에 합침", `${u.mgmt}:${u.name}`);
    u.b2b = true;
  }
}
const seen = new Map<string, number>();
units.forEach((u, i) => {
  const n = norm(u.name);
  if (!n || /^고객\d+$/.test(n)) return;
  const keys = u.b2b
    ? [`B|${n}`]
    : [...u.phones.map((ph) => `C|${n}|${ph}`), ...(u.street ? [`C|${n}|${norm(u.street).slice(0, 15)}`] : [])];
  for (const k of keys) {
    const j = seen.get(k);
    if (j === undefined) seen.set(k, i);
    else union(i, j);
  }
});
const groups = new Map<number, Unit[]>();
units.forEach((u, i) => {
  const g = groups.get(find(i)) ?? [];
  g.push(u);
  groups.set(find(i), g);
});

// ── Customers / contracts / equipment rows ───────────────────────────────

const STOP = new Set(["CONG", "TY", "CTY", "TNHH", "CO", "LTD", "CORP", "CORPORATION", "JSC", "MTV", "TM", "DV", "SX", "XD", "VA", "AND", "THE", "COMPANY", "CN", "CHI", "NHANH", "VPDD", "INC", "GROUP", "MR", "MS", "MRS"]);
// Shortcodes the target database already uses are taken.
const shortcodes = new Set<string>(
  existingCustomers.map((c) => (c["Shortcode"] ?? "").trim().toUpperCase()).filter(Boolean),
);
const reservedShortcodes = shortcodes.size;
function shortcodeFor(name: string): string {
  const words = ascii(name).split(/[^A-Z0-9]+/).filter((w) => w && !STOP.has(w));
  let base = words.length >= 2 ? words.map((w) => w[0]).join("") : (words[0] ?? "");
  base = base.slice(0, 5);
  if (base.length < 2) base = (base + "KR").slice(0, 2);
  if (!shortcodes.has(base)) return shortcodes.add(base), base;
  for (let n = 2; n < 1000; n++) {
    const cand = base.slice(0, 5 - String(n).length) + n;
    if (!shortcodes.has(cand)) return shortcodes.add(cand), cand;
  }
  throw new Error(`no free shortcode for ${name}`);
}

const byCode = (a: Unit, b: Unit) => Number(a.mgmt) - Number(b.mgmt);
const mostCommon = <T,>(xs: T[]): T | undefined => {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const listCodes = (us: Unit[]) => {
  const codes = us.map((u) => u.mgmt);
  return codes.length > 15 ? `${codes.slice(0, 15).join(", ")} 외 ${codes.length - 15}` : codes.join(", ");
};

const customerRows: Record<string, string>[] = [];
const contractRows: Record<string, string>[] = [];
const equipmentRows: Record<string, string>[] = [];
const consumableRows: Record<string, string>[] = [];
const paymentRows: Record<string, string>[] = [];

// Collected payments per unit. A 수금취소 row cancels the collection with the
// same unit, month and amount; one with nothing to cancel, and zero-amount
// rows, carry no money and are dropped.
const paymentsByUnit = new Map<string, Row[]>();
{
  // Collections first, then cancellations: the file does not keep a cancel
  // after the collection it reverses.
  const open = new Map<string, Row[]>(); // `${mgmt}|${month}|${amount}` → collections
  const keyOf = (r: Row) => `${r.SLCMSP01}|${r.SLCMSP07}|${r.SLCMSP05}`;
  for (const r of collections) {
    if (r.SLCMSP04 === "15") continue;
    if (!(Number(r.SLCMSP05) > 0)) {
      noteFix("금액 0원 수금 기록 → 건너뜀", `${r.SLCMSP01}:${r.SLCMSP07}`);
      continue;
    }
    open.set(keyOf(r), [...(open.get(keyOf(r)) ?? []), r]);
    paymentsByUnit.set(r.SLCMSP01, [...(paymentsByUnit.get(r.SLCMSP01) ?? []), r]);
  }
  for (const r of collections) {
    if (r.SLCMSP04 !== "15") continue;
    const hit = open.get(keyOf(r))?.pop();
    if (hit) {
      hit.cancelled = "1";
      noteFix("수금취소 → 같은 달·같은 금액의 수금을 상쇄", `${r.SLCMSP01}:${r.SLCMSP07} ${r.SLCMSP05}`);
    } else noteFix("상쇄할 수금이 없는 수금취소 → 건너뜀", `${r.SLCMSP01}:${r.SLCMSP07} ${r.SLCMSP05}`);
  }
}
const stats = { noPhone: { ACTIVE: 0, INACTIVE: 0 }, mixedContracts: 0, offCatalog: 0 };

for (const group of groups.values()) {
  group.sort(byCode);
  // Prefer what the live units say over cancelled ones.
  const live = group.filter((u) => u.status === "active");
  const pref = live.length ? live : group;
  const code = group[0].mgmt;
  const b2b = group[0].b2b;
  const name = mostCommon(pref.map((u) => u.name))!;
  const phones = [...new Set(pref.concat(group).flatMap((u) => u.phones))];
  const status = live.length ? "ACTIVE" : "INACTIVE";
  if (!phones[0]) stats.noPhone[status] += 1;
  const contactName = (b2b && mostCommon(pref.map((u) => u.contactTitle).filter((x): x is string => !!x))) || name;

  customerRows.push({
    "Customer Code": code,
    Name: name,
    Type: b2b ? "B2B" : "B2C",
    Shortcode: b2b ? shortcodeFor(name) : "",
    "Tax Code": "",
    "Contact Name": contactName,
    "Contact Phone": phones[0] ?? "",
    "Contact Email": "",
    Language: hasHangul(name) || hasHangul(contactName) ? "ko" : "vi",
    Province: mostCommon(pref.map((u) => u.province).filter((x): x is string => !!x)) ?? "",
    Ward: "",
    Street: pref.find((u) => u.street)?.street ?? "",
    Status: status,
    "Contact Phone 2": phones[1] ?? "",
    Notes: [
      `이전 시스템 관리번호 ${listCodes(group)} (${group.length}대)`,
      pref[0].staff && `담당 ${pref[0].staff}`,
      pref[0].referral && `소개처 ${pref[0].referral}`,
      pref[0].invoice && `증빙 ${pref[0].invoice}`,
      pref[0].region && `지역 ${pref[0].region}`,
    ].filter(Boolean).join(" · "),
  });

  // One contract per customer per start date: the contract number is built
  // from the customer and the date, so two on the same day would collide.
  const byDate = new Map<string, Unit[]>();
  for (const u of group) byDate.set(u.start, [...(byDate.get(u.start) ?? []), u]);
  for (const [start, us] of byDate) {
    us.sort(byCode);
    const types = us.map((u) => u.serviceType);
    const type = (["RENTAL", "MAINTENANCE", "SALE"] as const)
      .map((t) => [t, types.filter((x) => x === t).length] as const)
      .sort((a, b) => b[1] - a[1])[0][0];
    if (new Set(types).size > 1) stats.mixedContracts += 1;
    const anyLive = us.some((u) => u.status === "active");
    // Only a rental contract can have run its course, and only its rental
    // units decide that — a maintenance unit installed the same day rides
    // along. Anything else with a live unit is still in force.
    const running = us.some(
      (u) => u.status === "active" && (type !== "RENTAL" || (u.serviceType === "RENTAL" && !u.rentalOver)),
    );
    let state = "TERMINATED";
    if (running) state = "ACTIVE";
    else if (anyLive) state = "COMPLETED";
    const ends = us.map((u) => u.end).filter((x): x is string => !!x).sort();
    const sum = (xs: (number | null)[]) => {
      const t = xs.reduce<number>((a, x) => a + (x ?? 0), 0);
      return t > 0 ? String(t) : "";
    };
    const live = us.filter((u) => u.status === "active" && u.serviceType === "RENTAL" && !u.rentalOver);
    const runningEnd =
      type === "RENTAL" && live.length && live.every((u) => u.end)
        ? live.map((u) => u.end!).sort().at(-1)!
        : "";
    const feeUnits = anyLive ? us.filter((u) => u.status === "active") : us;
    const contractNo = us[0].mgmt;
    contractRows.push({
      "Contract No": contractNo,
      "Customer Code": code,
      Type: type,
      "Start Date": start,
      "Term Months": type === "RENTAL" ? String(Math.max(...us.map((u) => u.termMonths ?? 36))) : "",
      "Monthly Fee": sum(feeUnits.map((u) => u.fee)),
      Deposit: sum(us.map((u) => u.deposit)),
      "Total Value": sum(us.map((u) => u.saleAmount)),
      Notes: [
        `이전 관리번호 ${listCodes(us)}`,
        new Set(types).size > 1 && `유형 혼합: ${[...new Set(types)].map((t) => `${t} ${types.filter((x) => x === t).length}`).join(", ")}`,
        state === "COMPLETED" && "임대 기간 종료 — 이전 시스템에서는 '승인'으로 남아 있던 계약",
        us.find((u) => u.payment)?.payment,
        ...us.flatMap((u) => u.usd.map((x) => (us.length > 1 ? `${u.mgmt} ${x}` : x))),
      ].filter(Boolean).join(" · "),
      State: state,
      // A running contract ends with its running units — a unit whose rental
      // already ran out must not drag the date into the past.
      "End Date": state === "ACTIVE" ? runningEnd : (ends.at(-1) ?? ""),
      // A live unit's collection day wins over a cancelled one's.
      "Billing Day": String(
        (us.find((u) => u.status === "active" && u.billingDay) ?? us.find((u) => u.billingDay))?.billingDay ?? "",
      ),
    });

    for (const u of us) {
      if (!u.model) stats.offCatalog += 1;
      equipmentRows.push({
        "Equipment Key": u.mgmt,
        "Customer Code": code,
        "Contract No": contractNo,
        "Model Code": modelMap.get(u.model) ?? u.model,
        "Custom Description": u.model ? "" : "모델 미상 (이전 시스템 공란)",
        // The old 관리번호 doubles as the serial: unique per unit, and it is
        // what makes a second upload of this file skip instead of duplicate.
        Serial: u.mgmt,
        "Installed Date": u.start,
        "Service Type": u.serviceType,
        "Management Type": "FULL_SERVICE",
        "Monthly Fee": u.fee ? String(u.fee) : "",
        "Inspection Cycle Days": u.inspectionDays ? String(u.inspectionDays) : "",
        Notes: [u.notes, ...u.usd].join(" · "),
        Status: u.status === "active" ? "ACTIVE" : u.status === "lost" ? "DEACTIVATED" : "TERMINATED",
      });
      for (const c of u.consumables) {
        consumableRows.push({
          "Equipment Key": u.mgmt,
          "Consumable SKU": c.sku ? (filterMap.get(c.sku) ?? c.sku) : "",
          "Custom Name": c.customName ?? "",
          Quantity: String(c.qty),
          "Replace Every Days": c.days ? String(c.days) : "",
          "Last Replaced Date": c.last ?? "",
          Notes: "",
        });
      }
      for (const r of paymentsByUnit.get(u.mgmt) ?? []) {
        if (r.cancelled) continue;
        const paid = legacyDate(r.SLCMSP03, "수금일");
        const m = /^(\d{4})\.(\d{2})$/.exec(r.SLCMSP07);
        const month =
          m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 2000 && Number(m[1]) <= MAX_YEAR
            ? `${m[1]}-${m[2]}`
            : paid?.slice(0, 7);
        if (!month) {
          noteFix("해당년월·수금일 모두 읽을 수 없는 수금 → 건너뜀", `${u.mgmt}:${r.SLCMSP07}/${r.SLCMSP03}`);
          continue;
        }
        if (month !== r.SLCMSP07.replace(".", "-")) noteFix("해당년월이 잘못된 수금 → 수금일의 달", `${u.mgmt}:${r.SLCMSP07}→${month}`);
        const amount = Number(r.SLCMSP05);
        paymentRows.push({
          "Equipment Key": u.mgmt,
          "Billing Month": month,
          "Paid Date": paid ?? "",
          Amount: String(amount),
          // Same rule as the fees: small figures are the USD-billed members.
          Currency: amount < 10_000 ? "USD" : "VND",
          Method: u.payMethod,
          Notes: r.SLCMSP06 && r.SLCMSP06 !== "방문수금" ? r.SLCMSP06 : "",
        });
      }
    }
  }
}

// ── Catalog CSV ──────────────────────────────────────────────────────────

const category = (en: string, ko: string, vi: string) => existingCategories.get(ko.replace(/\s+/g, "")) ?? [en, ko, vi];
const CATEGORY = {
  water: category("Water purifier", "정수기", "Máy lọc nước"),
  air: category("Air purifier", "공기청정기", "Máy lọc không khí"),
  bidet: category("Bidet", "비데", "Bồn cầu thông minh"),
};
const AIR = /^(헤파|탈취|프리|HEPA|AIRF|Deode)/;
const linksByModel = new Map<string, Row[]>();
for (const l of modelLinks) {
  if (!l.WWG08 || l.WWG03 === INSPECTION_ID) continue;
  linksByModel.set(l.WWG08, [...(linksByModel.get(l.WWG08) ?? []), l]);
}
const modelNames = new Set([...legacyModels.map((m) => squash(m.WWMODEL01)), ...units.map((u) => u.model)].filter(Boolean));
const categoryOf = (model: string) => {
  const parts = (linksByModel.get(model) ?? []).map((l) => skuById.get(l.WWG03)?.sku ?? "");
  if (/^(필터|샤워기|중고)/.test(model)) return null;
  if (parts.some((p) => AIR.test(p)) || /^(AP|AIR|CA-)/i.test(model)) return CATEGORY.air;
  if (parts.some((p) => p.startsWith("SED비데"))) return CATEGORY.bidet;
  return CATEGORY.water;
};

const CATALOG_HEADERS = [
  "Brand", "Category (EN)", "Category (KO)", "Category (VI)", "Model Code",
  "Product Name (EN)", "Product Name (KO)", "Product Name (VI)",
  "Part Type", "Part SKU", "Part Name (EN)", "Part Name (KO)", "Part Name (VI)",
  "Quantity", "Replace Every (Days)",
];
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const catalogLines = [CATALOG_HEADERS.join(",")];
const linkedSkus = new Set<string>();
for (const model of [...modelNames].sort()) {
  // A mapped model already exists with its own filter set — leave it alone.
  if (modelMap.has(model)) continue;
  const cat = categoryOf(model) ?? ["", "", ""];
  const head = ["", ...cat, model, model, model, model];
  catalogLines.push([...head, "", "", "", "", "", "", ""].map(csvCell).join(","));
  for (const l of linksByModel.get(model) ?? []) {
    const f = skuById.get(l.WWG03);
    if (!f) continue;
    linkedSkus.add(f.sku);
    const mapped = filterMap.get(f.sku);
    const days = Number(l.WWG07) || f.cycleDays;
    catalogLines.push([...head, "CONSUMABLE", mapped ?? f.sku, f.name, f.name, f.name, "1", days ? String(days) : ""].map(csvCell).join(","));
  }
}
// Parts no model lists still have to exist: unit filter slots point at them.
for (const f of skuById.values()) {
  if (linkedSkus.has(f.sku) || filterMap.has(f.sku)) continue;
  catalogLines.push(["", "", "", "", "", "", "", "", "CONSUMABLE", f.sku, f.name, f.name, f.name, "", f.cycleDays ? String(f.cycleDays) : ""].map(csvCell).join(","));
}

// ── Write ────────────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "catalog.csv"), "﻿" + catalogLines.join("\r\n") + "\r\n");
const sheet = (name: string, headers: readonly string[], rows: Record<string, string>[]) => ({
  name,
  headers,
  rows: rows.map((r) => headers.map((h) => r[h] ?? "")),
});
// Split into several workbooks, whole customers per file. The proxy in front
// of the API cuts request bodies at 10 MB, and a smaller file is also a
// smaller all-or-nothing transaction. Upload the parts in any order.
const PART_ROWS = 12_000; // equipment + consumable + payment rows ≈ 6 MB of SpreadsheetML
const customerOfKey = new Map(equipmentRows.map((e) => [e["Equipment Key"], e["Customer Code"]]));
const weight = new Map<string, number>();
for (const r of [...equipmentRows, ...consumableRows, ...paymentRows]) {
  const c = r["Customer Code"] ?? customerOfKey.get(r["Equipment Key"])!;
  weight.set(c, (weight.get(c) ?? 0) + 1);
}
const parts: Set<string>[] = [new Set()];
let partLoad = 0;
for (const c of customerRows) {
  const w = weight.get(c["Customer Code"]) ?? 0;
  if (partLoad > 0 && partLoad + w > PART_ROWS) {
    parts.push(new Set());
    partLoad = 0;
  }
  parts.at(-1)!.add(c["Customer Code"]);
  partLoad += w;
}
parts.forEach((codes, i) => {
  const mine = (r: Record<string, string>) => codes.has(r["Customer Code"] ?? customerOfKey.get(r["Equipment Key"])!);
  writeFileSync(
    join(outDir, `migration-${String(i + 1).padStart(2, "0")}.xml`),
    buildSpreadsheetML([
      sheet(SHEETS.customers, HEADERS.customers, customerRows.filter(mine)),
      sheet(SHEETS.contracts, HEADERS.contracts, contractRows.filter(mine)),
      sheet(SHEETS.equipment, HEADERS.equipment, equipmentRows.filter(mine)),
      sheet(SHEETS.consumables, HEADERS.consumables, consumableRows.filter(mine)),
      sheet(SHEETS.payments, HEADERS.payments, paymentRows.filter(mine)),
    ]),
  );
});

// Against the target database: what the importer will skip as already in,
// and what looks like the same customer under another code.
const existingCodes = new Set(existingCustomers.map((c) => (c["Customer Code"] ?? "").toLowerCase()));
const existingByName = new Map<string, Record<string, string>[]>();
for (const c of existingCustomers) {
  const n = norm(c["Name"] ?? "");
  if (n) existingByName.set(n, [...(existingByName.get(n) ?? []), c]);
}
const alreadyIn = customerRows.filter((c) => existingCodes.has(c["Customer Code"].toLowerCase()));
const sameName = customerRows.filter(
  (c) => !existingCodes.has(c["Customer Code"].toLowerCase()) && existingByName.has(norm(c.Name)),
);
if (existingPath) {
  const lines = [["Legacy Code", "Name", "Type", "Status", "Existing Code(s)", "Existing Name"].join(",")];
  for (const c of sameName) {
    const hits = existingByName.get(norm(c.Name))!;
    lines.push(
      [c["Customer Code"], c.Name, c.Type, c.Status, hits.map((h) => h["Customer Code"]).join(" / "), hits[0]["Name"]]
        .map((v) => csvCell(v ?? ""))
        .join(","),
    );
  }
  writeFileSync(join(outDir, "possible-duplicates.csv"), "\uFEFF" + lines.join("\r\n") + "\r\n");
}

const count = <T,>(xs: T[], f: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
};
const report = `# Legacy DBF conversion report

Source: \`${dir}\` · billing snapshot: M${billingFile} · generated ${TODAY.toISOString()}

## Counts

| | |
|---|---|
| Units (WWM rows) | ${units.length} — ${count(units, (u) => u.status)} |
| Customers after grouping | ${customerRows.length} — ${count(customerRows, (c) => `${c.Type}/${c.Status}`)} |
| Contracts (one per customer per start date) | ${contractRows.length} — ${count(contractRows, (c) => `${c.Type}/${c.State}`)} |
| Contracts mixing unit types | ${stats.mixedContracts} |
| Equipment | ${equipmentRows.length} — ${count(equipmentRows, (e) => e.Status)} |
| Equipment without a model (off-catalog) | ${stats.offCatalog} |
| Payment history rows | ${paymentRows.length} — ${count(paymentRows, (p) => p.Currency)} |
| Contracts with a billing day | ${contractRows.filter((c) => c["Billing Day"]).length} |
| Consumable rows (active units only) | ${consumableRows.length} — ${consumableRows.filter((c) => !c["Consumable SKU"]).length} off-catalog |
| Catalog: models / filter SKUs | ${modelNames.size} / ${skuById.size} — mapped onto existing: ${modelMap.size} models, ${filterMap.size} filters${mappingDir ? ` (\`${mappingDir}\`)` : ""} |
| Customers with no phone anywhere | ACTIVE ${stats.noPhone.ACTIVE} · INACTIVE ${stats.noPhone.INACTIVE} |

## Repairs

| Kind | Count | Examples |
|---|---|---|
${[...fixes.entries()].sort((a, b) => b[1].count - a[1].count).map(([k, f]) => `| ${k} | ${f.count} | ${f.examples.join("; ").replaceAll("|", "/")} |`).join("\n")}

## Against the target database

${existingPath
  ? `- Export read: \`${existingPath}\` — ${existingCustomers.length} customers, ${reservedShortcodes} shortcodes in use (avoided)
- Customer codes already there (the importer skips them): ${alreadyIn.length}
- Same name as a customer already there, different code — **check before committing**: ${sameName.length} (listed in \`possible-duplicates.csv\`)`
  : "- Not checked — pass \`--existing <migration-export.xml>\` when importing into a database that already holds customers."}
${catalogPath ? `- Catalog read: \`${catalogPath}\` — ${[CATEGORY.water, CATEGORY.air, CATEGORY.bidet].filter((c) => existingCategories.has(c[1].replace(/\s+/g, ""))).length} of 3 제품군 already there and reused (${[...existingCategories.keys()].join(", ") || "none"})` : "- Catalog not checked — pass \`--catalog <catalog-export.csv>\` to reuse existing 제품군 names."}

## Region tags with no province

${[...unmappedRegions.entries()].map(([k, v]) => `- \`${k}\` × ${v}`).join("\n") || "- none"}

## Largest grouped customers

${[...groups.values()].sort((a, b) => b.length - a.length).slice(0, 15).map((g) => `- ${g[0].name} (${g[0].b2b ? "B2B" : "B2C"}) — ${g.length} units`).join("\n")}
`;
writeFileSync(join(outDir, "report.md"), report);
console.log(report);
