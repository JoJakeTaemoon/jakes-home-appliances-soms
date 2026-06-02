/**
 * Capture SOMS UI screenshots for the user manuals.
 *
 * Usage:
 *   npm run dev                   (in another terminal — leave running)
 *   npx tsx scripts/manuals/capture-screenshots.ts
 *
 * What it does:
 *   1. Connects to http://localhost:3000
 *   2. Logs in as each realm's seed user (ADMIN / TECHNICIAN / CONTRACT_PARTY)
 *   3. Navigates to every documented page and takes a desktop or mobile screenshot
 *   4. Saves PNGs under docs/manuals/screenshots/{office,field,customer}/
 *
 * Prerequisites:
 *   - Dev server reachable at localhost:3000
 *   - DB seeded with the default fixtures: `npm run db:reset:dev`
 *   - Seed credentials are read from SEED_OFFICE_PHONE / SEED_FIELD_PHONE /
 *     SEED_CUSTOMER_PHONE env vars OR fallback constants below.
 *
 * Each screenshot is a fresh page load with a fixed viewport so the manual
 * PDFs stay visually consistent across rebuilds.
 */

import { chromium, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SHOTS = path.join(ROOT, "docs/manuals/screenshots");
const BASE = process.env.MANUAL_BASE_URL ?? "http://localhost:3000";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 412, height: 915 };  // Pixel 5-ish

const SEED = {
  office: {
    phone: process.env.SEED_OFFICE_PHONE ?? "0900000001",
    password: process.env.SEED_OFFICE_PASSWORD ?? "admin1234",
  },
  field: {
    phone: process.env.SEED_FIELD_PHONE ?? "0900000010",
    password: process.env.SEED_FIELD_PASSWORD ?? "tech1234",
  },
  customer: {
    phone: process.env.SEED_CUSTOMER_PHONE ?? "0911111111",
    password: process.env.SEED_CUSTOMER_PASSWORD ?? "customer1234",
  },
};

interface Shot {
  /** Slug used in the filename (without extension). */
  name: string;
  /** Relative URL to load. */
  url: string;
  /** Viewport — desktop for office, mobile for field/customer. */
  viewport?: { width: number; height: number };
  /** Selector or timeout ms to wait after navigation before snapping. */
  waitFor?: string | number;
  /** Optional clip region for tight crops. */
  fullPage?: boolean;
}

const OFFICE_SHOTS: Shot[] = [
  { name: "01-login", url: "/o/login", waitFor: 500 },
  { name: "02-dashboard", url: "/o/dashboard", waitFor: 1500 },
  { name: "03-customers-list", url: "/o/customers", waitFor: "table" },
  { name: "04-customers-new", url: "/o/customers/new", waitFor: 500 },
  { name: "05-contracts-list", url: "/o/contracts", waitFor: "table" },
  { name: "06-contracts-new", url: "/o/contracts/new", waitFor: 800 },
  { name: "07-visits-list", url: "/o/visits", waitFor: "table" },
  { name: "08-visits-new", url: "/o/visits/new", waitFor: 800 },
  { name: "09-service-requests", url: "/o/service-requests", waitFor: 800 },
  { name: "10-payments", url: "/o/payments", waitFor: "table" },
  { name: "11-tax-invoices", url: "/o/tax-invoices", waitFor: 800 },
  { name: "12-reports-audit", url: "/o/reports/audit", waitFor: 800 },
  { name: "13-admin-users", url: "/o/admin/users", waitFor: 800 },
  { name: "14-admin-products", url: "/o/admin/products", waitFor: 800 },
  { name: "15-admin-scheduler-weights", url: "/o/admin/scheduler-weights", waitFor: 500 },
];

const FIELD_SHOTS: Shot[] = [
  { name: "01-login", url: "/f/login", viewport: MOBILE, waitFor: 500 },
  { name: "02-today", url: "/f/today", viewport: MOBILE, waitFor: 800 },
  { name: "03-upcoming", url: "/f/upcoming", viewport: MOBILE, waitFor: 800 },
  { name: "04-profile", url: "/f/profile", viewport: MOBILE, waitFor: 500 },
];

const CUSTOMER_SHOTS: Shot[] = [
  { name: "01-login", url: "/login", viewport: MOBILE, waitFor: 500 },
  { name: "02-home", url: "/", viewport: MOBILE, waitFor: 800 },
  { name: "03-equipment", url: "/equipment", viewport: MOBILE, waitFor: 800 },
  { name: "04-visits", url: "/visits", viewport: MOBILE, waitFor: 800 },
  { name: "05-requests", url: "/requests", viewport: MOBILE, waitFor: 800 },
  { name: "06-requests-new", url: "/requests/new", viewport: MOBILE, waitFor: 500 },
  { name: "07-invoices", url: "/invoices", viewport: MOBILE, waitFor: 800 },
  { name: "08-payments", url: "/payments", viewport: MOBILE, waitFor: 800 },
  { name: "09-contacts", url: "/contacts", viewport: MOBILE, waitFor: 800 },
  { name: "10-settings", url: "/settings", viewport: MOBILE, waitFor: 500 },
];

async function settle(page: Page, waitFor?: string | number) {
  if (!waitFor) return;
  if (typeof waitFor === "number") {
    await page.waitForTimeout(waitFor);
    return;
  }
  try {
    await page.waitForSelector(waitFor, { timeout: 5_000 });
  } catch {
    // best-effort
  }
}

async function loginOffice(page: Page) {
  await page.goto(`${BASE}/o/login`);
  await page.waitForSelector("input", { timeout: 10_000 });
  await page.fill('input[name="phone"], input[type="tel"], input[placeholder*="phone" i], input[placeholder*="전화" i]', SEED.office.phone);
  await page.fill('input[type="password"], input[name="password"]', SEED.office.password);
  await page.click('button[type="submit"], button:has-text("로그인"), button:has-text("Login")');
  await page.waitForURL(/\/o\/(dashboard|login)/, { timeout: 10_000 });
}

async function loginField(page: Page) {
  await page.goto(`${BASE}/f/login`);
  await page.waitForSelector("input", { timeout: 10_000 });
  await page.fill('input[type="tel"], input[name="phone"]', SEED.field.phone);
  await page.fill('input[type="password"]', SEED.field.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/f\/(today|login)/, { timeout: 10_000 });
}

async function loginCustomer(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector("input", { timeout: 10_000 });
  await page.fill('input[type="tel"], input[name="phone"]', SEED.customer.phone);
  await page.fill('input[type="password"]', SEED.customer.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(login)?$/, { timeout: 10_000 });
}

async function captureBatch(
  context: BrowserContext,
  groupName: "office" | "field" | "customer",
  shots: Shot[],
  defaultViewport: { width: number; height: number },
  login: (p: Page) => Promise<void>,
) {
  const outDir = path.join(SHOTS, groupName);
  await fs.mkdir(outDir, { recursive: true });

  // First capture the public login screen (no auth) using a fresh context page.
  const loginPage = await context.newPage();
  await loginPage.setViewportSize(defaultViewport);
  const loginShot = shots.find((s) => s.name === "01-login");
  if (loginShot) {
    const viewport = loginShot.viewport ?? defaultViewport;
    await loginPage.setViewportSize(viewport);
    await loginPage.goto(`${BASE}${loginShot.url}`);
    await settle(loginPage, loginShot.waitFor);
    const file = path.join(outDir, `${loginShot.name}.png`);
    await loginPage.screenshot({ path: file, fullPage: loginShot.fullPage ?? false });
    process.stdout.write(`  ${groupName}/${loginShot.name}.png ✓\n`);
  }
  await loginPage.close();

  // Now log in once on the shared context and capture authenticated shots.
  const page = await context.newPage();
  await page.setViewportSize(defaultViewport);
  try {
    await login(page);
  } catch (e) {
    console.warn(`  ⚠ ${groupName} login failed: ${(e as Error).message} — skipping authenticated shots`);
    await page.close();
    return;
  }

  for (const shot of shots) {
    if (shot.name === "01-login") continue;  // already captured
    const viewport = shot.viewport ?? defaultViewport;
    await page.setViewportSize(viewport);
    try {
      await page.goto(`${BASE}${shot.url}`);
      await settle(page, shot.waitFor);
      const file = path.join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
      process.stdout.write(`  ${groupName}/${shot.name}.png ✓\n`);
    } catch (e) {
      process.stdout.write(`  ${groupName}/${shot.name}.png ✗  (${(e as Error).message})\n`);
    }
  }

  await page.close();
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });

  console.log(`Capturing screenshots against ${BASE} ...`);

  const browser = await chromium.launch();

  console.log("== Office (desktop) ==");
  const officeCtx = await browser.newContext({ viewport: DESKTOP, locale: "ko" });
  await captureBatch(officeCtx, "office", OFFICE_SHOTS, DESKTOP, loginOffice);
  await officeCtx.close();

  console.log("== Field (mobile) ==");
  const fieldCtx = await browser.newContext({ viewport: MOBILE, locale: "ko", isMobile: true, hasTouch: true });
  await captureBatch(fieldCtx, "field", FIELD_SHOTS, MOBILE, loginField);
  await fieldCtx.close();

  console.log("== Customer (mobile) ==");
  const customerCtx = await browser.newContext({ viewport: MOBILE, locale: "ko", isMobile: true, hasTouch: true });
  await captureBatch(customerCtx, "customer", CUSTOMER_SHOTS, MOBILE, loginCustomer);
  await customerCtx.close();

  await browser.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
