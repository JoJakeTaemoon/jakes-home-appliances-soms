/**
 * E2E for Task 2a.6 — the 4-step bulk-register wizard (고객 → 장비 →
 * 판매방식 → 서비스구성). Runs against the real dev server + seeded dev DB
 * (see playwright.config.ts webServer + `npm run db:seed:dev`).
 *
 * Flow: search + select a seeded B2C customer (KH00001) → pick the seeded
 * PTS-2100 model, quantity 2, auto asset-code mode → RENTAL with
 * deposit/monthlyRent/termMonths → edit one filter's 사용주기 → submit →
 * assert we land on a contract or customer detail page (not stuck on the
 * wizard / an error banner).
 *
 * Login reuses the officeLogin pattern from e2e/manual-screenshots.spec.ts
 * (phone/password auth against the /o/ko/login form).
 *
 * The wizard's "auto" asset-code mode generates `WA{yymmdd}{seq}` — fixed
 * for a given day/quantity, so re-running this spec on the same day would
 * collide with the previous run's rows (`assetCode` is globally unique).
 * The test intercepts the bulk-register response and deletes everything it
 * created in a `finally` block so the run is idempotent / repeatable.
 */

import "dotenv/config";
import { test, expect, Page } from "@playwright/test";
import prisma from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";
const LOCALE = "ko";

test.setTimeout(90_000);

interface BulkRegisterResult {
  equipmentIds: string[];
  visitIds: string[];
  contractId: string | null;
}

async function waitIdle(page: Page, timeout = 10000) {
  try {
    await page.waitForLoadState("networkidle", { timeout });
  } catch {
    // normal for SPA — some requests (react-query polling) never go idle
  }
}

async function officeLogin(page: Page, phone = "012345678", pw = "12341234") {
  await page.goto(`${BASE_URL}/o/${LOCALE}/login`, { waitUntil: "domcontentloaded" });
  const phoneInput = page.locator('input[type="tel"], input[name="phone"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 15000 });
  await phoneInput.fill(phone);
  await page.locator('input[type="password"]').first().fill(pw);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  await waitIdle(page);
}

async function cleanupCreated(result: BulkRegisterResult | null) {
  if (!result) return;
  const { equipmentIds, contractId } = result;
  if (contractId) {
    await prisma.contractEquipment.deleteMany({ where: { contractId } });
    await prisma.contract.delete({ where: { id: contractId } }).catch(() => {});
  }
  if (equipmentIds.length > 0) {
    await prisma.equipmentConsumable.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
    await prisma.visit.deleteMany({ where: { equipmentId: { in: equipmentIds } } });
    await prisma.equipment.deleteMany({ where: { id: { in: equipmentIds } } });
  }
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("bulk-register wizard: customer -> model -> RENTAL -> filter edit -> submit", async ({ page }) => {
  let created: BulkRegisterResult | null = null;
  page.on("response", (res) => {
    if (res.request().method() !== "POST" || !res.url().includes("/api/equipment/bulk-register")) {
      return;
    }
    res
      .json()
      .then((body) => {
        if (body?.success) created = body.data as BulkRegisterResult;
      })
      .catch(() => {});
  });

  try {
    await officeLogin(page);

    await page.goto(`${BASE_URL}/o/${LOCALE}/equipment/bulk-register`, {
      waitUntil: "domcontentloaded",
    });
    await waitIdle(page);

    // ── Step 1: search + select customer ────────────────────────────
    await page.getByLabel("검색어").fill("KH00001");
    await page.getByRole("button", { name: "검색" }).click();
    const customerRow = page.locator("tbody tr", { hasText: "KH00001" }).first();
    await customerRow.waitFor({ state: "visible", timeout: 15000 });
    await customerRow.click();
    // Detail panel on the right renders the picked customer's name.
    await expect(page.getByText("Nguyễn Thị Lan")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 2: model + quantity + auto asset code ──────────────────
    await page.getByRole("button", { name: "모델 선택" }).click();
    await page.getByRole("option", { name: /PTS-2100/ }).first().click();

    await page.getByLabel("설치할 장비 수량").fill("2");
    // Auto mode is the default — the preview box should now show 2 codes.
    await expect(page.getByText("생성될 관리번호 미리보기")).toBeVisible();

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 3: RENTAL service method ────────────────────────────────
    // RENTAL is the wizard's default selection, so its fields are already
    // rendered — just fill the money/term inputs.
    await page.getByLabel("보증금").fill("500000");
    await page.getByLabel("월 임대료").fill("150000");
    await page.getByLabel("계약기간 (개월)").fill("36");

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 4: service config — edit the first filter's 사용주기 ────
    const firstFilterRow = page.locator("table tbody tr").first();
    await firstFilterRow.waitFor({ state: "visible", timeout: 15000 });
    await firstFilterRow.getByLabel("사용주기").fill("45");

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 5: 최종 확인 — the review summary should surface the entries ─
    await expect(page.getByText("입력 내용 최종 확인")).toBeVisible();
    // Deposit total = 500,000 × 2 = 1,000,000 (dot-grouped VND).
    await expect(page.getByText("1.000.000 ₫").first()).toBeVisible();

    // ── Submit ────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "완료" }).click();

    await page.waitForURL((url) => /\/(contracts|customers)\//.test(url.pathname), {
      timeout: 20000,
    });
    expect(page.url()).toMatch(/\/(contracts|customers)\//);

    expect(created).not.toBeNull();
    expect(created!.equipmentIds).toHaveLength(2);
    expect(created!.visitIds).toHaveLength(2);
    expect(created!.contractId).not.toBeNull();
  } finally {
    await cleanupCreated(created);
  }
});
