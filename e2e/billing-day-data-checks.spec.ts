/**
 * E2E — contract billing day (출금일), no-fee warning, customer data-checks
 * banner and the equipment filter "no change on record" note. Fixtures are
 * created straight through Prisma and removed in afterAll.
 *
 * Run: npx playwright test e2e/billing-day-data-checks.spec.ts --project=desktop-chrome
 */
import "dotenv/config";
import { test, expect, Page } from "@playwright/test";
import prisma from "@/lib/prisma";

const BASE_URL = "http://localhost:3000";
const LOCALE = "ko";
const rand = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

test.setTimeout(120_000);

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

const ids = {
  customer: "", cleanCustomer: "", contract: "", contact: "", model: "", consumable: "", equipment: "",
};

test.describe.serial("billing day + data checks", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const tag = `E2EBD${rand()}`;
    const customer = await prisma.customer.create({
      data: { code: `${tag}`, name: `${tag} customer`, type: "B2C" },
    });
    ids.customer = customer.id;
    ids.cleanCustomer = (await prisma.customer.create({
      data: { code: `${tag}C`, name: `${tag} clean`, type: "B2C" },
    })).id;
    await prisma.customerContact.create({
      data: { customerId: customer.id, role: "CONTRACT_PARTY", scope: "CUSTOMER", name: "E2E Party", phone1: `0931${rand()}`, email: "party@example.com" },
    });
    ids.contact = (await prisma.customerContact.create({
      data: {
        customerId: customer.id, role: "OPS_CONTACT", scope: "CUSTOMER", isPrimary: true,
        needsReview: true, name: "E2E Ops Review", phone1: `0932${rand()}`,
      },
    })).id;
    ids.contract = (await prisma.contract.create({
      data: {
        customerId: customer.id, contractNumber: `HD-${tag}`, type: "MAINTENANCE", state: "ACTIVE",
        startDate: new Date("2024-01-01"), activatedAt: new Date("2024-01-01"),
      },
    })).id;
    ids.model = (await prisma.equipmentModel.create({
      data: { modelCode: `E2E-${tag}`, nameKo: "m", nameVi: "m", nameEn: "m" },
    })).id;
    ids.consumable = (await prisma.consumable.create({
      data: { sku: `E2E-SKU-${tag}`, nameKo: "E2E필터", nameVi: "E2E filter", nameEn: "E2E filter", replaceEveryDays: 90, retailPrice: 0 },
    })).id;
    ids.equipment = (await prisma.equipment.create({
      data: {
        customerId: customer.id, modelId: ids.model, assetCode: `TE2E-${rand()}`, status: "ACTIVE",
        installedAt: daysAgo(400),
        consumables: { create: { consumableId: ids.consumable, replaceEveryDays: 90 } },
      },
    })).id;

    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await officeLogin(page, "0123456782"); // seeded STAFF
  });

  test.afterAll(async () => {
    const cids = [ids.customer, ids.cleanCustomer].filter(Boolean);
    if (cids.length) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ids.contract, ids.contact, ids.equipment, ...cids] } } }).catch(() => {});
      await prisma.equipmentConsumable.deleteMany({ where: { equipment: { customerId: { in: cids } } } });
      await prisma.contractEquipment.deleteMany({ where: { contract: { customerId: { in: cids } } } });
      await prisma.contract.deleteMany({ where: { customerId: { in: cids } } });
      await prisma.equipment.deleteMany({ where: { customerId: { in: cids } } });
      await prisma.customerContact.deleteMany({ where: { customerId: { in: cids } } });
      await prisma.customer.deleteMany({ where: { id: { in: cids } } });
    }
    if (ids.consumable) await prisma.consumable.deleteMany({ where: { id: ids.consumable } });
    if (ids.model) await prisma.equipmentModel.deleteMany({ where: { id: ids.model } });
    await prisma.$disconnect();
    await page?.close();
  });

  test("1. billing day: 25 persists, 32 rejected", async () => {
    await page.goto(`${BASE_URL}/o/${LOCALE}/contracts/${ids.contract}`, { waitUntil: "domcontentloaded" });
    const input = page.locator("#contract-billing-day");
    await input.waitFor({ state: "visible", timeout: 60000 });

    await input.fill("32");
    await page.getByRole("button", { name: "저장", exact: true }).first().click();
    await expect(page.getByRole("alert").filter({ hasText: "1에서 31 사이의 날짜" })).toBeVisible();
    expect((await prisma.contract.findUnique({ where: { id: ids.contract } }))?.billingDay).toBeNull();

    await input.fill("25");
    const saved = page.waitForResponse((r) => r.url().includes(`/api/contracts/${ids.contract}`) && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "저장", exact: true }).first().click();
    expect((await saved).ok()).toBe(true);
    expect((await prisma.contract.findUnique({ where: { id: ids.contract } }))?.billingDay).toBe(25);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#contract-billing-day")).toHaveValue("25", { timeout: 60000 });
  });

  test("2. no-fee contract shows amber warning", async () => {
    await page.goto(`${BASE_URL}/o/${LOCALE}/contracts/${ids.contract}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status").filter({ hasText: "월 금액이 없어 매월 청구가 만들어지지 않습니다" })).toBeVisible({ timeout: 60000 });
  });

  test("3. customer banner, contacts tab badge, edit clears it", async () => {
    await page.goto(`${BASE_URL}/o/${LOCALE}/customers/${ids.customer}`, { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("status").filter({ hasText: "확인이 필요한 항목" });
    await expect(banner).toBeVisible({ timeout: 60000 });
    await expect(banner).toContainText("운영 담당자 1명");
    await expect(banner).toContainText("월 금액이 없는 계약 1건");
    await expect(banner).toContainText(`HD-`);
    await expect(banner).toContainText("필터 교환 기록이 없는 장비 1대");

    await banner.getByRole("button", { name: "담당자 탭 열기" }).click();
    await expect(page.getByText("확인 필요").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Ops Review" })).toBeVisible();

    // Edit the ops contact (the card that holds the name): enter an email, save.
    const card = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: "E2E Ops Review" }) }).last();
    await card.getByRole("button", { name: "수정" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="email"]').fill("e2e.ops@example.com");
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
    await expect(page.getByText("확인 필요")).toHaveCount(0, { timeout: 30000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    const again = page.getByRole("status").filter({ hasText: "확인이 필요한 항목" });
    await expect(again).toBeVisible({ timeout: 60000 });
    await expect(again).not.toContainText("운영 담당자");
    await expect(again).toContainText("월 금액이 없는 계약");
  });

  test("3b. customer with nothing to check shows no banner", async () => {
    await page.goto(`${BASE_URL}/o/${LOCALE}/customers/${ids.cleanCustomer}`, { waitUntil: "domcontentloaded" });
    const checks = page.waitForResponse((r) => r.url().includes(`/api/customers/${ids.cleanCustomer}/data-checks`), { timeout: 60000 });
    expect((await checks).ok()).toBe(true);
    await expect(page.getByText("확인이 필요한 항목")).toHaveCount(0);
  });

  test("4. equipment note disappears after entering last change date", async () => {
    await page.goto(`${BASE_URL}/o/${LOCALE}/equipment/${ids.equipment}`, { waitUntil: "domcontentloaded" });
    const note = page.getByRole("status").filter({ hasText: "교환 기록이 없어 설치일 기준으로 교체일을 계산" });
    await expect(note).toBeVisible({ timeout: 60000 });
    const cell = page.getByLabel("E2E필터 최근 수행일");
    await expect(cell).toBeVisible();
    const done = page.waitForResponse((r) => r.url().includes(`/api/equipment/${ids.equipment}/consumables`) && ["POST", "PATCH"].includes(r.request().method()));
    await cell.fill(daysAgo(20).toISOString().slice(0, 10));
    expect((await done).ok()).toBe(true);
    await expect(note).toBeHidden({ timeout: 30000 });
  });
});
