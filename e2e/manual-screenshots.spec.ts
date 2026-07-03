/**
 * Manual screenshot capture spec — run with:
 *   npx playwright test e2e/manual-screenshots.spec.ts --project=desktop-chrome --workers=3
 *
 * Locale is env-driven via `MANUAL_LOCALE` (default: "ko"). To capture the
 * Vietnamese manual assets:
 *   MANUAL_LOCALE=vi npx playwright test e2e/manual-screenshots.spec.ts --project=desktop-chrome --workers=3
 *
 * Saves PNGs to docs/manuals/screenshots/{locale}/{office,field,customer}/NN-name.png
 * Each test is independent (no serial mode) so failures don't cascade.
 */

import { test, Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.setTimeout(90_000);

const BASE_URL = "http://localhost:3000";
const LOCALE = process.env.MANUAL_LOCALE ?? "ko";

const SCREENSHOT_BASE = path.resolve(
  __dirname,
  `../docs/manuals/screenshots/${LOCALE}`
);

async function shot(
  page: Page,
  dir: "office" | "field" | "customer",
  filename: string
) {
  const outDir = path.join(SCREENSHOT_BASE, dir);
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`  [shot] ${filePath}`);
  } catch (e) {
    console.error(`  [shot-fail] ${filePath}:`, String(e).split("\n")[0]);
  }
}

async function waitIdle(page: Page, timeout = 10000) {
  try {
    await page.waitForLoadState("networkidle", { timeout });
  } catch {
    // normal for SPA
  }
}

async function officeLogin(page: Page, phone: string, pw = "12341234", locale = LOCALE) {
  await page.goto(`${BASE_URL}/o/${locale}/login`, { waitUntil: "domcontentloaded" });
  const phoneInput = page.locator('input[type="tel"], input[name="phone"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 15000 });
  await phoneInput.fill(phone);
  await page.locator('input[type="password"]').first().fill(pw);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});
  await waitIdle(page);
}

async function fieldLogin(page: Page, phone: string, pw = "12341234", locale = LOCALE) {
  await page.goto(`${BASE_URL}/f/${locale}/login`, { waitUntil: "domcontentloaded" });
  const phoneInput = page.locator('#identifier').first();
  await phoneInput.waitFor({ state: "visible", timeout: 15000 });
  await phoneInput.fill(phone);
  await page.locator('input[type="password"]').first().fill(pw);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});
  await waitIdle(page);
}

async function customerLogin(page: Page, phone: string, pw: string, locale = LOCALE) {
  await page.goto(`${BASE_URL}/${locale}/login`, { waitUntil: "domcontentloaded" });
  const phoneInput = page.locator('input[type="tel"], input[name="phone"]').first();
  await phoneInput.waitFor({ state: "visible", timeout: 15000 });
  await phoneInput.fill(phone);
  await page.locator('input[type="password"]').first().fill(pw);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});
  await waitIdle(page);
}

// Click a tab by matching text (case-insensitive regex)
async function clickTab(page: Page, pattern: RegExp) {
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    const t = tabs.nth(i);
    const label = await t.textContent();
    if (label && pattern.test(label)) {
      await t.click();
      await waitIdle(page, 5000);
      return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────
// OFFICE SCREENSHOTS
// ──────────────────────────────────────────────

test("office-01 Login page", async ({ page }) => {
  await page.goto(`${BASE_URL}/o/${LOCALE}/login`);
  await waitIdle(page);
  await shot(page, "office", "01-login.png");
});

test("office-02 Dashboard", async ({ page }) => {
  await officeLogin(page, "012345678");
  await shot(page, "office", "02-dashboard.png");
});

test("office-03 Sidebar full snapshot", async ({ page }) => {
  await officeLogin(page, "012345678");
  await shot(page, "office", "03-sidebar.png");
});

test("office-04 Customers list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers`);
  await waitIdle(page);
  await shot(page, "office", "04-customers-list.png");
});

test("office-05 Customer B2C detail overview", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page);
  }
  await shot(page, "office", "05-customer-detail-overview.png");
});

test("office-06 Customer equipment tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page, 8000);
  }
  await clickTab(page, /장비|보유|Equipment/i);
  await shot(page, "office", "06-customer-equipment-tab.png");
});

test("office-07 Customer contracts tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page, 8000);
  }
  await clickTab(page, /계약|Contract/i);
  await shot(page, "office", "07-customer-contracts-tab.png");
});

test("office-08 Customer purchase history tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page, 8000);
  }
  await clickTab(page, /구매|Purchase/i);
  await shot(page, "office", "08-customer-purchase-tab.png");
});

test("office-09 Customer orders tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page, 8000);
  }
  await clickTab(page, /주문|Order/i);
  await shot(page, "office", "09-customer-orders-tab.png");
});

test("office-10 Sales reps list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/sales-reps`);
  await waitIdle(page);
  await shot(page, "office", "10-sales-reps-list.png");
});

test("office-11 Sales rep detail", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/sales-reps`);
  await waitIdle(page);
  // cards are <button> elements
  const card = page.locator("button").first();
  if (await card.count() > 0) {
    await card.click();
    await waitIdle(page);
  }
  await shot(page, "office", "11-sales-rep-detail.png");
});

test("office-12 Sales rep customers tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/sales-reps`);
  await waitIdle(page);
  const card = page.locator("button").first();
  if (await card.count() > 0) {
    await card.click();
    await waitIdle(page);
  }
  await clickTab(page, /담당 고객|고객|Customer/i);
  await shot(page, "office", "12-sales-rep-customers-tab.png");
});

test("office-13 Sales rep revenue tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/sales-reps`);
  await waitIdle(page);
  const card = page.locator("button").first();
  if (await card.count() > 0) {
    await card.click();
    await waitIdle(page);
  }
  await clickTab(page, /매출|Revenue|기간별/i);
  await shot(page, "office", "13-sales-rep-revenue-tab.png");
});

test("office-14 Sales rep receivables tab", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/sales-reps`);
  await waitIdle(page);
  const card = page.locator("button").first();
  if (await card.count() > 0) {
    await card.click();
    await waitIdle(page);
  }
  await clickTab(page, /미수금|Receivable/i);
  await shot(page, "office", "14-sales-rep-receivables-tab.png");
});

test("office-15 Equipment list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/equipment`);
  await waitIdle(page);
  await shot(page, "office", "15-equipment-list.png");
});

test("office-16 Equipment detail with service config", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/equipment`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page);
  }
  await shot(page, "office", "16-equipment-detail.png");
});

test("office-17 Equipment bulk register step1", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/equipment/bulk-register`);
  await waitIdle(page);
  await shot(page, "office", "17-bulk-register-step1.png");
});

test("office-18 Equipment installation history", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/equipment/installation-history`);
  await waitIdle(page);
  await shot(page, "office", "18-installation-history.png");
});

test("office-19 Contracts list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/contracts`);
  await waitIdle(page);
  await shot(page, "office", "19-contracts-list.png");
});

test("office-20 Contract detail", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/contracts`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page);
  }
  await shot(page, "office", "20-contract-detail.png");
});

test("office-21 Visits list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/visits`);
  await waitIdle(page);
  await shot(page, "office", "21-visits-list.png");
});

test("office-22 Visit detail with multi-doc card", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/visits`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page);
  }
  await shot(page, "office", "22-visit-detail.png");
});

test("office-23 Visit new form", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/visits/new`);
  await waitIdle(page);
  await shot(page, "office", "23-visit-new.png");
});

test("office-24 Visits bulk print", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/visits/print`);
  await waitIdle(page);
  await shot(page, "office", "24-visits-print.png");
});

test("office-25 Service requests list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/service-requests`);
  await waitIdle(page);
  await shot(page, "office", "25-service-requests-list.png");
});

test("office-26 Service request detail", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/service-requests`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page);
  }
  await shot(page, "office", "26-service-request-detail.png");
});

test("office-27 Payments list", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/payments`);
  await waitIdle(page);
  await shot(page, "office", "27-payments-list.png");
});

test("office-28 Schedule board", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/schedule-board`);
  await waitIdle(page);
  await shot(page, "office", "28-schedule-board.png");
});

test("office-29 Admin users page", async ({ page }) => {
  await officeLogin(page, "012345678");
  await page.goto(`${BASE_URL}/o/${LOCALE}/admin`);
  await waitIdle(page);
  await shot(page, "office", "29-admin-users.png");
});

test("office-30 B2B customer detail", async ({ page }) => {
  await officeLogin(page, "012345678");
  // Search for B2B customer KH00002
  await page.goto(`${BASE_URL}/o/${LOCALE}/customers?q=KH00002`);
  await waitIdle(page);
  const row = page.locator("tbody tr").first();
  if (await row.count() > 0) {
    await row.click();
    await waitIdle(page);
  }
  await shot(page, "office", "30-customer-b2b-detail.png");
});

// ──────────────────────────────────────────────
// FIELD SCREENSHOTS — mobile viewport
// ──────────────────────────────────────────────

test("field-01 Field login", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/f/${LOCALE}/login`);
    await waitIdle(page);
    await shot(page, "field", "01-login.png");
  } finally { await ctx.close(); }
});

test("field-02 Today visits list", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await waitIdle(page);
    await shot(page, "field", "02-today.png");
  } finally { await ctx.close(); }
});

test("field-03 Upcoming visits", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await page.goto(`${BASE_URL}/f/${LOCALE}/upcoming`);
    await waitIdle(page);
    await shot(page, "field", "03-upcoming.png");
  } finally { await ctx.close(); }
});

test("field-04 Visit detail", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await page.goto(`${BASE_URL}/f/${LOCALE}/visits`);
    await waitIdle(page);
    const link = page.locator('a[href*="/visits/"]').first();
    if (await link.count() > 0) {
      await link.click();
      await waitIdle(page);
    }
    await shot(page, "field", "04-visit-detail.png");
  } finally { await ctx.close(); }
});

test("field-05 Visit start button state", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await page.goto(`${BASE_URL}/f/${LOCALE}/today`);
    await waitIdle(page);
    const link = page.locator('a[href*="/visits/"]').first();
    if (await link.count() > 0) {
      await link.click();
      await waitIdle(page);
    }
    await shot(page, "field", "05-visit-start.png");
  } finally { await ctx.close(); }
});

test("field-06 Visits list", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await page.goto(`${BASE_URL}/f/${LOCALE}/visits`);
    await waitIdle(page);
    await shot(page, "field", "06-visits-list.png");
  } finally { await ctx.close(); }
});

test("field-07 Profile page", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await page.goto(`${BASE_URL}/f/${LOCALE}/profile`);
    await waitIdle(page);
    await shot(page, "field", "07-profile.png");
  } finally { await ctx.close(); }
});

test("field-08 Visit signature area (scrolled)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await fieldLogin(page, "0123456783");
    await page.goto(`${BASE_URL}/f/${LOCALE}/visits`);
    await waitIdle(page);
    const link = page.locator('a[href*="/visits/"]').first();
    if (await link.count() > 0) {
      await link.click();
      await waitIdle(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
    }
    await shot(page, "field", "08-visit-signature.png");
  } finally { await ctx.close(); }
});

// ──────────────────────────────────────────────
// CUSTOMER PORTAL SCREENSHOTS — mobile viewport
// ──────────────────────────────────────────────

test("customer-01 Portal login", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/${LOCALE}/login`);
    await waitIdle(page);
    await shot(page, "customer", "01-login.png");
  } finally { await ctx.close(); }
});

test("customer-02 Portal home", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await waitIdle(page);
    await shot(page, "customer", "02-home.png");
  } finally { await ctx.close(); }
});

test("customer-03 Portal equipment", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/equipment`);
    await waitIdle(page);
    await shot(page, "customer", "03-equipment.png");
  } finally { await ctx.close(); }
});

test("customer-04 Portal visits", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/visits`);
    await waitIdle(page);
    await shot(page, "customer", "04-visits.png");
  } finally { await ctx.close(); }
});

test("customer-05 Portal service requests", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/requests`);
    await waitIdle(page);
    await shot(page, "customer", "05-requests.png");
  } finally { await ctx.close(); }
});

test("customer-06 Portal new service request modal", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/requests`);
    await waitIdle(page);
    const btn = page.locator("button").filter({ hasText: /신청|새/i }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await waitIdle(page, 5000);
    }
    await shot(page, "customer", "06-requests-new.png");
  } finally { await ctx.close(); }
});

test("customer-07 Portal invoices", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/invoices`);
    await waitIdle(page);
    await shot(page, "customer", "07-invoices.png");
  } finally { await ctx.close(); }
});

test("customer-08 Portal payments", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/payments`);
    await waitIdle(page);
    await shot(page, "customer", "08-payments.png");
  } finally { await ctx.close(); }
});

test("customer-09 Portal contacts", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/contacts`);
    await waitIdle(page);
    await shot(page, "customer", "09-contacts.png");
  } finally { await ctx.close(); }
});

test("customer-10 Portal settings", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await customerLogin(page, "0901555000", "portal1234");
    await page.goto(`${BASE_URL}/${LOCALE}/settings`);
    await waitIdle(page);
    await shot(page, "customer", "10-settings.png");
  } finally { await ctx.close(); }
});
