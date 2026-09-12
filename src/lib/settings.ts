/**
 * Generic key/value system settings (Phase 7 — UC-AD-05 scheduler weights
 * + future admin-tunable knobs).
 *
 * Values are JSON-typed; callers decode per key. Cached 60s in-memory so
 * the scheduler doesn't hit the DB on every recommendation call.
 */

import prisma from "@/lib/prisma";
import { HQ_PHONE } from "@/lib/config/company";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

export async function getSetting<T>(
  key: string,
  fallback: T,
): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value as T;

  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const value = (row?.value ?? fallback) as T;
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    cache.set(key, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return fallback;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedById?: string | null,
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as never, updatedById: updatedById ?? null },
    update: { value: value as never, updatedById: updatedById ?? null },
  });
  cache.delete(key);
}

export function clearSettingsCache(): void {
  cache.clear();
}

/** Test helper. */
export function __resetSettingsCacheForTest(): void {
  cache.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Typed accessors for known keys
// ─────────────────────────────────────────────────────────────────────────

export const SCHEDULER_WEIGHTS_KEY = "scheduler.weights";

export interface SchedulerWeights {
  preferred: number;
  regionMatch: number;
  loadPenaltyPerVisit: number;
}

export const SCHEDULER_WEIGHTS_DEFAULT: SchedulerWeights = {
  preferred: 100,
  regionMatch: 50,
  loadPenaltyPerVisit: 10,
};

export async function getSchedulerWeights(): Promise<SchedulerWeights> {
  const raw = await getSetting<Partial<SchedulerWeights>>(
    SCHEDULER_WEIGHTS_KEY,
    SCHEDULER_WEIGHTS_DEFAULT,
  );
  return {
    preferred: typeof raw.preferred === "number" ? raw.preferred : SCHEDULER_WEIGHTS_DEFAULT.preferred,
    regionMatch:
      typeof raw.regionMatch === "number"
        ? raw.regionMatch
        : SCHEDULER_WEIGHTS_DEFAULT.regionMatch,
    loadPenaltyPerVisit:
      typeof raw.loadPenaltyPerVisit === "number"
        ? raw.loadPenaltyPerVisit
        : SCHEDULER_WEIGHTS_DEFAULT.loadPenaltyPerVisit,
  };
}

export async function setSchedulerWeights(
  weights: SchedulerWeights,
  updatedById?: string | null,
): Promise<void> {
  await setSetting(SCHEDULER_WEIGHTS_KEY, weights, updatedById);
}

// ─────────────────────────────────────────────────────────────────────────
// Company HQ phone — admin-editable, single source of truth for the
// "Call HQ" action and every {hq_phone} notification placeholder.
// Falls back to the HQ_PHONE constant when no row exists yet.
// ─────────────────────────────────────────────────────────────────────────

export const COMPANY_HQ_PHONE_KEY = "company.hqPhone";
export const COMPANY_HQ_PHONE_DEFAULT = HQ_PHONE;

export async function getHqPhone(): Promise<string> {
  const raw = await getSetting<string>(COMPANY_HQ_PHONE_KEY, COMPANY_HQ_PHONE_DEFAULT);
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim()
    : COMPANY_HQ_PHONE_DEFAULT;
}

export async function setHqPhone(
  phone: string,
  updatedById?: string | null,
): Promise<void> {
  await setSetting(COMPANY_HQ_PHONE_KEY, phone.trim(), updatedById);
}

/** Bare digits suitable for a `tel:` href, derived from any display format. */
export function hqPhoneTel(displayPhone: string): string {
  return displayPhone.replace(/[^\d+]/g, "");
}

// ─────────────────────────────────────────────────────────────────────────
// Company tax info — legal entity name, registered address, representative,
// MST (Mã số thuế / tax code). Used when generating contracts, tax invoices,
// and any document that must show the issuing company's legal block.
// ─────────────────────────────────────────────────────────────────────────

export const COMPANY_TAX_INFO_KEY = "company.taxInfo";

export interface CompanyTaxInfo {
  /** Legal entity name (Vietnamese, full form). */
  legalName: string;
  /** Registered headquarters address. */
  address: string;
  /** Authorized representative (Người đại diện theo pháp luật). */
  representativeName: string;
  /** Vietnamese tax code (Mã số thuế / MST). 10 or 13 digits. */
  taxCode: string;
}

export const COMPANY_TAX_INFO_DEFAULT: CompanyTaxInfo = {
  legalName:
    "CÔNG TY TNHH MỘT THÀNH VIÊN THƯƠNG MẠI VÀ DỊCH VỤ JAKE'S HA",
  address:
    "Số 47 Đường Hoàng Trọng Mậu, Khu dân cư Him Lam, Phường Tân Hưng, TP Hồ Chí Minh, Việt Nam",
  representativeName: "CHOI ONE HO",
  taxCode: "0309395579",
};

export async function getCompanyTaxInfo(): Promise<CompanyTaxInfo> {
  const raw = await getSetting<Partial<CompanyTaxInfo>>(
    COMPANY_TAX_INFO_KEY,
    COMPANY_TAX_INFO_DEFAULT,
  );
  return {
    legalName:
      typeof raw.legalName === "string" && raw.legalName.trim().length > 0
        ? raw.legalName.trim()
        : COMPANY_TAX_INFO_DEFAULT.legalName,
    address:
      typeof raw.address === "string" && raw.address.trim().length > 0
        ? raw.address.trim()
        : COMPANY_TAX_INFO_DEFAULT.address,
    representativeName:
      typeof raw.representativeName === "string" &&
      raw.representativeName.trim().length > 0
        ? raw.representativeName.trim()
        : COMPANY_TAX_INFO_DEFAULT.representativeName,
    taxCode:
      typeof raw.taxCode === "string" && raw.taxCode.trim().length > 0
        ? raw.taxCode.trim()
        : COMPANY_TAX_INFO_DEFAULT.taxCode,
  };
}

export async function setCompanyTaxInfo(
  info: CompanyTaxInfo,
  updatedById?: string | null,
): Promise<void> {
  await setSetting(
    COMPANY_TAX_INFO_KEY,
    {
      legalName: info.legalName.trim(),
      address: info.address.trim(),
      representativeName: info.representativeName.trim(),
      taxCode: info.taxCode.trim(),
    },
    updatedById,
  );
}
