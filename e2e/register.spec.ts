/**
 * E2E for Task 2b.3 — the 4-step multi-line register wizard (고객 → 장비 →
 * 판매방식 → 서비스구성). Mirrors e2e/bulk-register.spec.ts's login / API-
 * interception / cleanup pattern, but drives TWO model lines bundled into
 * ONE contract (register's whole point vs. bulk-register's single line ×
 * quantity): line 1 = PTS-2100 RENTAL, line 2 = PTS-4000T SALE.
 *
 * The wizard's per-line accordions (Step 3/4) share radio-label text
 * ("렌탈"/"판매"/"유지보수") across lines when more than one is expanded at
 * once, so the test collapses line 1's accordion before expanding line 2's
 * to keep every `getByLabel` lookup unambiguous — same reason bulk-register
 * only ever has one line open.
 */

import "dotenv/config";
import { test, expect, Page } from "@playwright/test";
import prisma from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";
const LOCALE = "ko";

test.setTimeout(90_000);

interface RegisterResult {
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

async function cleanupCreated(result: RegisterResult | null) {
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

test("register wizard: customer -> 2 lines (RENTAL + SALE) -> 1 contract -> submit", async ({
  page,
}) => {
  let created: RegisterResult | null = null;
  page.on("response", (res) => {
    if (res.request().method() !== "POST" || !res.url().includes("/api/equipment/register")) {
      return;
    }
    res
      .json()
      .then((body) => {
        if (body?.success) created = body.data as RegisterResult;
      })
      .catch(() => {});
  });

  try {
    await officeLogin(page);

    await page.goto(`${BASE_URL}/o/${LOCALE}/equipment/register`, {
      waitUntil: "domcontentloaded",
    });
    await waitIdle(page);

    // ── Step 1: search + select customer ────────────────────────────
    await page.getByLabel("검색어").fill("KH00001");
    await page.getByRole("button", { name: "검색" }).click();
    const customerRow = page.locator("tbody tr", { hasText: "KH00001" }).first();
    await customerRow.waitFor({ state: "visible", timeout: 15000 });
    await customerRow.click();
    await expect(page.getByText("Nguyễn Thị Lan")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 2: line 1 (PTS-2100, quantity 1, auto asset code) ───────
    await page.getByRole("button", { name: "모델 선택" }).click();
    await page.getByRole("option", { name: /PTS-2100/ }).first().click();

    // ── + 라인 추가 → line 2 (PTS-4000T) ──────────────────────────────
    await page.getByRole("button", { name: "+ 라인 추가" }).click();
    // Line 1 already has a model selected, so exactly one "모델 선택"
    // placeholder button remains — line 2's.
    await page.getByRole("button", { name: "모델 선택" }).click();
    await page.getByRole("option", { name: /PTS-4000T/ }).first().click();

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 3: bundled contract info (defaults) + per-line method ───
    // Top-of-step contract number/date/term keep their auto/default
    // values — only the per-line accordions need editing.

    // Line 1 (PTS-2100) accordion is open by default; RENTAL is the
    // per-line default method, so just fill the money fields.
    await page.getByLabel("보증금").fill("500000");
    await page.getByLabel("월 임대료").fill("150000");

    // Collapse line 1 before opening line 2 so radio-label text
    // ("렌탈"/"판매"/"유지보수") isn't duplicated across two open
    // accordions.
    await page.getByRole("button", { name: /PTS-2100/ }).click();
    await page.getByRole("button", { name: /PTS-4000T/ }).click();

    // exact:true — "판매" is also a substring of the salePrice field's
    // aria-label ("판매단가"), which would otherwise match ambiguously.
    await page.getByLabel("판매", { exact: true }).check();
    await page.getByLabel("판매단가").fill("2000000");

    await page.getByRole("button", { name: "다음 단계" }).click();

    // ── Step 4: service config — defaults are fine, no interaction ───
    await waitIdle(page);

    // ── Submit ────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "완료" }).click();

    await page.waitForURL((url) => /\/(contracts|customers)\//.test(url.pathname), {
      timeout: 20000,
    });
    expect(page.url()).toMatch(/\/(contracts|customers)\//);

    expect(created).not.toBeNull();
    expect(created!.equipmentIds).toHaveLength(2);
    expect(created!.contractId).not.toBeNull();
  } finally {
    await cleanupCreated(created);
  }
});
