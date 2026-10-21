/**
 * E2E — /o/ko/admin/migration with a Billing Day column and a Payments sheet.
 *
 * Run: npx playwright test e2e/migration-payments.spec.ts --project=desktop-chrome
 */
import "dotenv/config";
import { test, expect, Page } from "@playwright/test";
import prisma from "@/lib/prisma";
import { buildSpreadsheetML } from "@/lib/xlsx/spreadsheet-ml";
import { HEADERS, SHEETS } from "@/lib/migration/plan";

const BASE_URL = "http://localhost:3000";
const LOCALE = "ko";
const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const TAG = `E2EMIG${rand()}`;
const MODEL = `E2E-MIG-${rand()}`;

test.setTimeout(180_000);

const workbook = buildSpreadsheetML([
  { name: SHEETS.customers, headers: HEADERS.customers, rows: [
    [`${TAG}-C1`, `${TAG} customer`, "B2C", "", "", "Lan", `0933${rand()}`, "", "vi", "", "", "", "ACTIVE", "", ""],
  ] },
  { name: SHEETS.contracts, headers: HEADERS.contracts, rows: [
    [`${TAG}-K1`, `${TAG}-C1`, "MAINTENANCE", "2024-01-01", "", "300000", "", "", "", "ACTIVE", "", 25],
  ] },
  { name: SHEETS.equipment, headers: HEADERS.equipment, rows: [
    [`${TAG}-E1`, `${TAG}-C1`, `${TAG}-K1`, MODEL, "", `${TAG}-S1`, "2024-01-01", "MAINTENANCE", "FULL_SERVICE", "300000", "", "", "ACTIVE"],
  ] },
  { name: SHEETS.consumables, headers: HEADERS.consumables, rows: [] },
  { name: SHEETS.payments, headers: HEADERS.payments, rows: [
    [`${TAG}-E1`, "2024-04", "2024-04-24", 300000, "VND", "CASH", ""],
    [`${TAG}-E1`, "2014-10", "2014-10-14", 17, "USD", "", ""],
  ] },
]);

async function officeLogin(page: Page, phone: string, pw = "12341234") {
  await page.goto(`${BASE_URL}/o/${LOCALE}/login`, { waitUntil: "domcontentloaded" });
  const phoneInput = page.locator('input[type="tel"], input[name="phone"]').first();
  const pwInput = page.locator('input[type="password"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 30000 });
  // The login page logs out on mount and hydration can wipe an early fill:
  // fill both fields and submit inside one retry block.
  await expect(async () => {
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await phoneInput.fill(phone);
    await pwInput.fill(pw);
    await expect(phoneInput).toHaveValue(phone, { timeout: 1000 });
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  }).toPass({ timeout: 90000 });
}

async function upload(page: Page) {
  await page.goto(`${BASE_URL}/o/${LOCALE}/admin/migration`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-migration.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from(workbook, "utf8"),
  });
  await page.getByRole("button", { name: "검사", exact: false }).first().click();
}

async function cleanup() {
  const cs = await prisma.customer.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const ids = cs.map((c) => c.id);
  await prisma.payment.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.visit.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.equipmentConsumable.deleteMany({ where: { equipment: { customerId: { in: ids } } } });
  await prisma.contractEquipment.deleteMany({ where: { contract: { customerId: { in: ids } } } });
  await prisma.contract.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.equipment.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

test.describe.serial("migration with billing day + payments", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await prisma.equipmentModel.create({ data: { modelCode: MODEL, nameKo: "m", nameVi: "m", nameEn: "m" } });
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await officeLogin(page, "012345678"); // seeded ADMIN
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.equipmentModel.deleteMany({ where: { modelCode: MODEL } });
    await prisma.$disconnect();
    await page?.close();
  });

  test("5a. check passes, confirm applies, DB has billing day + payments + review contact", async () => {
    await upload(page);
    const result = page.locator("section").filter({ hasText: "수금 이력" }).last();
    await expect(result).toBeVisible({ timeout: 60000 });
    await expect(result.locator("tr", { hasText: "수금 이력" }).locator("td").nth(1)).toHaveText("2");
    await expect(result.locator("tr", { hasText: "고객" }).first().locator("td").nth(1)).toHaveText("1");
    await expect(result.locator("table.w-full.text-xs")).toHaveCount(0); // no error table

    await page.getByRole("button", { name: "확정", exact: false }).last().click();
    await expect(page.getByText(/수금 이력 2건을 등록했습니다/)).toBeVisible({ timeout: 60000 });

    const customer = await prisma.customer.findFirstOrThrow({ where: { legacyCode: `${TAG}-C1` } });
    const contract = await prisma.contract.findFirstOrThrow({ where: { customerId: customer.id } });
    expect(contract.billingDay).toBe(25);
    const pays = await prisma.payment.findMany({ where: { customerId: customer.id } });
    expect(pays).toHaveLength(2);
    expect(pays.every((p) => p.state === "RECONCILED")).toBe(true);
    expect(pays.map((p) => p.currency).sort()).toEqual(["USD", "VND"]);
    const ops = await prisma.customerContact.findFirst({ where: { customerId: customer.id, role: "OPS_CONTACT" } });
    expect(ops?.needsReview).toBe(true);
  });

  test("5b. same file again: everything skipped, nothing new", async () => {
    await upload(page);
    const result = page.locator("section").filter({ hasText: "수금 이력" }).last();
    await expect(result.getByText("새로 등록할 행이 없습니다")).toBeVisible({ timeout: 60000 });
    await expect(result.locator("tr", { hasText: "고객" }).first().locator("td").nth(1)).toHaveText("0");
    await expect(result.locator("tr", { hasText: "고객" }).first().locator("td").nth(2)).toHaveText("1");
    expect(await prisma.customer.count({ where: { name: { startsWith: TAG } } })).toBe(1);
    expect(await prisma.payment.count({ where: { customer: { name: { startsWith: TAG } } } })).toBe(2);
  });
});
