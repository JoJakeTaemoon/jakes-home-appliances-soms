/**
 * Capture SOMS UI screenshots for the user manuals.
 *
 * Usage:
 *   npm run dev                   (in another terminal — leave running)
 *   npx tsx scripts/manuals/capture-screenshots.ts
 *
 * What it does:
 *   1. Connects to http://localhost:3000
 *   2. For each locale (ko, vi), logs in as each realm's seed user (ADMIN /
 *      TECHNICIAN / CONTRACT_PARTY)
 *   3. Navigates to every documented page (with the locale prefix) and takes
 *      a desktop or mobile screenshot
 *   4. Saves PNGs under docs/manuals/screenshots/{ko,vi}/{office,field,customer}/
 *      so each language manual can reference UI in its own language.
 *
 * Prerequisites:
 *   - Dev server reachable at localhost:3000
 *   - DB seeded with the default fixtures: `npm run db:reset:dev`
 *   - Seed credentials are read from SEED_OFFICE_PHONE / SEED_FIELD_PHONE /
 *     SEED_CUSTOMER_PHONE env vars OR fallback constants below.
 *
 * Each screenshot is a fresh page load with a fixed viewport so the manual
 * PDFs stay visually consistent across rebuilds.
 *
 * URL placeholders supported in Shot.url (resolved per-batch from the seeded
 * DB via the authenticated office API):
 *   {{LOCALE}}      → current capture locale ("ko" | "vi")
 *   {{TODAY}}       → today in YYYY-MM-DD (VST)
 *   {{TECH_ID}}     → ID of the first TECHNICIAN returned from /api/users
 *   {{SAMPLE_VISIT_ID}} → fixed seed-visit-doc-delivery-receipt
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
    phone: process.env.SEED_OFFICE_PHONE ?? "012345678",
    password: process.env.SEED_OFFICE_PASSWORD ?? "12341234",
  },
  field: {
    phone: process.env.SEED_FIELD_PHONE ?? "0123456783",
    password: process.env.SEED_FIELD_PASSWORD ?? "12341234",
  },
  customer: {
    // Per-locale customer accounts so a mustChangePassword flow in one
    // locale doesn't break login in the other locale. KH00003 is the only
    // seed contact with KO portal language; KH00001 is the canonical VI
    // contact (mustChangePassword=true on first login).
    ko: {
      phone: process.env.SEED_CUSTOMER_PHONE_KO ?? "0901555000",
      password: process.env.SEED_CUSTOMER_PASSWORD_KO ?? "portal1234",
    },
    vi: {
      phone: process.env.SEED_CUSTOMER_PHONE_VI ?? "0901234567",
      password: process.env.SEED_CUSTOMER_PASSWORD_VI ?? "portal1234",
    },
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
  { name: "01-login", url: "/o/{{LOCALE}}/login", waitFor: 500 },
  { name: "02-dashboard", url: "/o/{{LOCALE}}/dashboard", waitFor: 1500 },
  { name: "03-customers-list", url: "/o/{{LOCALE}}/customers", waitFor: "table" },
  { name: "04-customers-new", url: "/o/{{LOCALE}}/customers/new", waitFor: 500 },
  { name: "05-contracts-list", url: "/o/{{LOCALE}}/contracts", waitFor: "table" },
  { name: "06-contracts-new", url: "/o/{{LOCALE}}/contracts/new", waitFor: 800 },
  { name: "07-visits-list", url: "/o/{{LOCALE}}/visits", waitFor: "table" },
  { name: "08-visits-new", url: "/o/{{LOCALE}}/visits/new", waitFor: 800 },
  { name: "09-service-requests", url: "/o/{{LOCALE}}/service-requests", waitFor: 800 },
  { name: "10-payments", url: "/o/{{LOCALE}}/payments", waitFor: "table" },
  { name: "11-tax-invoices", url: "/o/{{LOCALE}}/tax-invoices", waitFor: 800 },
  { name: "12-reports-audit", url: "/o/{{LOCALE}}/reports/audit", waitFor: 800 },
  { name: "13-admin-users", url: "/o/{{LOCALE}}/admin/users", waitFor: 800 },
  { name: "14-admin-products", url: "/o/{{LOCALE}}/admin/products", waitFor: 800 },
  { name: "15-admin-scheduler-weights", url: "/o/{{LOCALE}}/admin/scheduler-weights", waitFor: 500 },
  // ── Phase 6 — visit-management deep dive ────────────────────────────
  { name: "16-schedule-board", url: "/o/{{LOCALE}}/schedule-board", waitFor: 2500 },
  { name: "17-visits-unassigned", url: "/o/{{LOCALE}}/visits?view=unassigned", waitFor: 2500 },
  { name: "18-visit-document-issue", url: "/o/{{LOCALE}}/visits/{{SAMPLE_VISIT_ID}}", waitFor: 2000 },
  // Pick a date + technician with multiple visits so the bulk-print
  // preview shows a real per-tech bundle. tech ID is resolved at runtime
  // from /api/users; date is today.
  { name: "19-visits-print", url: "/o/{{LOCALE}}/visits/print?date={{TODAY}}&technicianId={{TECH_ID}}", waitFor: 3500 },
];

const FIELD_SHOTS: Shot[] = [
  { name: "01-login", url: "/f/{{LOCALE}}/login", viewport: MOBILE, waitFor: 500 },
  { name: "02-today", url: "/f/{{LOCALE}}/today", viewport: MOBILE, waitFor: 2500 },
  { name: "03-upcoming", url: "/f/{{LOCALE}}/upcoming", viewport: MOBILE, waitFor: 2500 },
  { name: "04-profile", url: "/f/{{LOCALE}}/profile", viewport: MOBILE, waitFor: 1500 },
  // ── Phase 6 — mobile signature-doc previews ─────────────────────────
  { name: "05-visit-detail-signature-docs", url: "/f/{{LOCALE}}/visits/{{SAMPLE_VISIT_ID}}", viewport: MOBILE, waitFor: 2500 },
];

const CUSTOMER_SHOTS: Shot[] = [
  { name: "01-login", url: "/{{LOCALE}}/login", viewport: MOBILE, waitFor: 500 },
  { name: "02-home", url: "/{{LOCALE}}", viewport: MOBILE, waitFor: 2500 },
  { name: "03-equipment", url: "/{{LOCALE}}/equipment", viewport: MOBILE, waitFor: 2500 },
  { name: "04-visits", url: "/{{LOCALE}}/visits", viewport: MOBILE, waitFor: 2500 },
  { name: "05-requests", url: "/{{LOCALE}}/requests", viewport: MOBILE, waitFor: 2500 },
  { name: "06-requests-new", url: "/{{LOCALE}}/requests/new", viewport: MOBILE, waitFor: 1500 },
  { name: "07-invoices", url: "/{{LOCALE}}/invoices", viewport: MOBILE, waitFor: 2500 },
  { name: "08-payments", url: "/{{LOCALE}}/payments", viewport: MOBILE, waitFor: 2500 },
  { name: "09-contacts", url: "/{{LOCALE}}/contacts", viewport: MOBILE, waitFor: 2500 },
  { name: "10-settings", url: "/{{LOCALE}}/settings", viewport: MOBILE, waitFor: 1500 },
];

type Locale = "ko" | "vi";

interface BatchCtx {
  locale: Locale;
  techId: string | null;
  today: string;
  sampleVisitId: string;
}

function resolveUrl(template: string, ctx: BatchCtx): string {
  return template
    .replaceAll("{{LOCALE}}", ctx.locale)
    .replaceAll("{{TODAY}}", ctx.today)
    .replaceAll("{{TECH_ID}}", ctx.techId ?? "")
    .replaceAll("{{SAMPLE_VISIT_ID}}", ctx.sampleVisitId);
}

/**
 * Hide the Next.js dev-mode error / build-status overlay (the floating
 * "N Issue" pill at the bottom of every page in `next dev`). It is
 * never part of the actual product UI and would otherwise clutter the
 * manual screenshots.
 */
async function hideDevOverlay(page: Page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-toast-wrapper],
      [data-nextjs-dialog-overlay],
      [data-nextjs-build-indicator],
      [data-next-mark],
      #__next-build-watcher { display: none !important; visibility: hidden !important; }
    `,
  });
}

async function settle(page: Page, waitFor?: string | number) {
  if (!waitFor) return;
  if (typeof waitFor === "number") {
    await page.waitForTimeout(waitFor);
  } else {
    try {
      await page.waitForSelector(waitFor, { timeout: 5_000 });
    } catch {
      // best-effort
    }
  }
}

/**
 * Robust submit: fills phone + password, waits for the login API to
 * respond 200, then waits for redirect to the post-login route. Throws
 * if either step fails so captureBatch can surface a clear error
 * instead of silently re-capturing the login screen.
 */
async function submitLogin(
  page: Page,
  loginUrl: string,
  loginApi: RegExp,
  postLoginUrl: RegExp,
  phone: string,
  password: string,
) {
  await page.goto(`${BASE}${loginUrl}`);
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });

  // Office uses #phone, field uses #identifier; cover both. Customer
  // uses the same office-style id="phone" on /login.
  const phoneInput = page.locator(
    '#phone, #identifier, input[type="tel"], input[inputmode="tel"], input[placeholder*="phone" i]',
  ).first();
  await phoneInput.waitFor({ state: "visible", timeout: 10_000 });
  await phoneInput.fill(phone);

  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.waitFor({ state: "visible", timeout: 5_000 });
  await pwInput.fill(password);

  // Wait for the submit to actually fire BEFORE clicking.
  const apiResp = page.waitForResponse(
    (r) => loginApi.test(r.url()) && r.request().method() === "POST",
    { timeout: 15_000 },
  );
  await page.locator('button[type="submit"]').first().click();
  const resp = await apiResp;
  if (resp.status() !== 200) {
    throw new Error(`login API responded ${resp.status()} for ${resp.url()}`);
  }

  // After 200, wait for the client-side redirect to the post-login URL.
  await page.waitForURL(postLoginUrl, { timeout: 10_000 });
  // Give the cookie store a beat to settle before subsequent page.goto
  // calls (otherwise navigation can race and middleware sees no cookie,
  // bouncing us back to /f/login).
  await page.waitForTimeout(400);
}

function loginOffice(locale: Locale) {
  return async (page: Page) => {
    await submitLogin(
      page,
      `/o/${locale}/login`,
      /\/api\/auth\/login(\?|$)/,
      /\/o\/[a-z-]+\/dashboard/,
      SEED.office.phone,
      SEED.office.password,
    );
  };
}

function loginField(locale: Locale) {
  return async (page: Page) => {
    await submitLogin(
      page,
      `/f/${locale}/login`,
      /\/api\/auth\/field\/login(\?|$)/,
      /\/f\/[a-z-]+\/today/,
      SEED.field.phone,
      SEED.field.password,
    );
  };
}

function loginCustomer(locale: Locale) {
  return async (page: Page) => {
    const seedAccount = SEED.customer[locale];
    await submitLogin(
      page,
      `/${locale}/login`,
      /\/api\/portal\/auth\/login(\?|$)/,
      /\/[a-z-]+\/(change-password|equipment|visits|requests|settings|invoices|payments|contacts)?(\?|$)|\/[a-z-]+\/?$/,
      seedAccount.phone,
      seedAccount.password,
    );

    // Seed contact ships with mustChangePassword=true → first login lands
    // on /change-password. Form has 3 inputs (#cur, #new, #confirm). We
    // pick a NEW password so the API doesn't reject PASSWORD_REUSE.
    if (/\/change-password/.test(page.url())) {
      const newPw = seedAccount.password + "x";  // e.g. portal1234x
      const cur = page.locator('input#cur').first();
      const next = page.locator('input#new').first();
      const confirm = page.locator('input#cnf').first();
      await cur.fill(seedAccount.password);
      await next.fill(newPw);
      await confirm.fill(newPw);
      const apiResp = page.waitForResponse(
        (r) => /\/api\/portal\/auth\/change-password(\?|$)/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 },
      );
      await page.locator('button[type="submit"]').first().click();
      const resp = await apiResp;
      if (resp.status() !== 200) {
        throw new Error(`change-password API responded ${resp.status()}`);
      }
      // The form does setTimeout(800) → router.replace("/"). Wait for the
      // redirect away from /change-password.
      await page.waitForURL((url) => !/\/change-password/.test(url.pathname), {
        timeout: 10_000,
      });
    }
  };
}

async function fetchFirstTechId(page: Page): Promise<string | null> {
  try {
    const result = await page.evaluate(async () => {
      const resp = await fetch("/api/users?role=TECHNICIAN&limit=10");
      if (!resp.ok) return null;
      const json = await resp.json();
      const list = Array.isArray(json) ? json : json?.data ?? [];
      for (const u of list) {
        if (u?.role === "TECHNICIAN" && u?.id) return u.id as string;
      }
      return list[0]?.id ?? null;
    });
    return result as string | null;
  } catch {
    return null;
  }
}

function todayInVST(): string {
  // YYYY-MM-DD in Asia/Ho_Chi_Minh (UTC+7)
  const now = new Date();
  const vst = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vst.toISOString().slice(0, 10);
}

async function captureBatch(
  context: BrowserContext,
  locale: Locale,
  groupName: "office" | "field" | "customer",
  shots: Shot[],
  defaultViewport: { width: number; height: number },
  login: (p: Page) => Promise<void>,
) {
  const outDir = path.join(SHOTS, locale, groupName);
  await fs.mkdir(outDir, { recursive: true });

  const baseCtx: BatchCtx = {
    locale,
    techId: null,
    today: todayInVST(),
    sampleVisitId: "seed-visit-doc-delivery-receipt",
  };

  // First capture the public login screen (no auth) using a fresh context page.
  const loginPage = await context.newPage();
  await loginPage.setViewportSize(defaultViewport);
  const loginShot = shots.find((s) => s.name === "01-login");
  if (loginShot) {
    const viewport = loginShot.viewport ?? defaultViewport;
    await loginPage.setViewportSize(viewport);
    await loginPage.goto(`${BASE}${resolveUrl(loginShot.url, baseCtx)}`);
    await settle(loginPage, loginShot.waitFor);
    const file = path.join(outDir, `${loginShot.name}.png`);
    await loginPage.screenshot({ path: file, fullPage: loginShot.fullPage ?? false });
    process.stdout.write(`  ${locale}/${groupName}/${loginShot.name}.png ✓\n`);
  }
  await loginPage.close();

  // Now log in once on the shared context and capture authenticated shots.
  const page = await context.newPage();
  await page.setViewportSize(defaultViewport);
  try {
    await login(page);
  } catch (e) {
    console.warn(`  ⚠ ${locale}/${groupName} login failed: ${(e as Error).message} — skipping authenticated shots`);
    await page.close();
    return;
  }

  // For the office batch, resolve a real TECHNICIAN id so the bulk-print
  // shot lands on a populated bundle. Field/customer batches don't use it.
  if (groupName === "office") {
    baseCtx.techId = await fetchFirstTechId(page);
    if (baseCtx.techId) {
      process.stdout.write(`  ${locale}/office tech id = ${baseCtx.techId} (today=${baseCtx.today})\n`);
    } else {
      process.stdout.write(`  ⚠ ${locale}/office: failed to resolve tech id; bulk-print may be empty\n`);
    }
  }

  const isLoginUrl = (urlStr: string) => {
    const u = new URL(urlStr);
    return /\/(o\/login|f\/login)$|\/login(\?|$)/.test(u.pathname + u.search);
  };

  for (const shot of shots) {
    if (shot.name === "01-login") continue;  // already captured
    const viewport = shot.viewport ?? defaultViewport;
    await page.setViewportSize(viewport);
    try {
      const url = resolveUrl(shot.url, baseCtx);
      let bouncedToLogin = false;
      // Up to 3 attempts: an auth-cookie race can bounce the first
      // navigation back to /login even though we're authenticated.
      // Re-login + retry once if that happens.
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.goto(`${BASE}${url}`);
        await settle(page, shot.waitFor);
        bouncedToLogin = isLoginUrl(page.url());
        if (!bouncedToLogin) break;
        if (attempt === 0) {
          // Re-establish the session and try again.
          try { await login(page); } catch { /* fall through */ }
        } else {
          // Final retry: just give it a longer beat.
          await page.waitForTimeout(1500);
        }
      }
      // Hide Next.js dev overlay just before the snapshot.
      await hideDevOverlay(page).catch(() => undefined);
      await page.waitForTimeout(150);  // let CSS apply
      const file = path.join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
      const tag = bouncedToLogin ? "✗ (auth bounce after retry)" : "✓";
      process.stdout.write(`  ${locale}/${groupName}/${shot.name}.png ${tag}\n`);
    } catch (e) {
      process.stdout.write(`  ${locale}/${groupName}/${shot.name}.png ✗  (${(e as Error).message})\n`);
    }
  }

  await page.close();
}

async function captureLocale(browser: Awaited<ReturnType<typeof chromium.launch>>, locale: Locale) {
  console.log(`\n══════ Locale: ${locale} ══════`);

  console.log(`== Office (desktop) [${locale}] ==`);
  const officeCtx = await browser.newContext({ viewport: DESKTOP, locale });
  await captureBatch(officeCtx, locale, "office", OFFICE_SHOTS, DESKTOP, loginOffice(locale));
  await officeCtx.close();

  console.log(`== Field (mobile) [${locale}] ==`);
  const fieldCtx = await browser.newContext({ viewport: MOBILE, locale, isMobile: true, hasTouch: true });
  await captureBatch(fieldCtx, locale, "field", FIELD_SHOTS, MOBILE, loginField(locale));
  await fieldCtx.close();

  console.log(`== Customer (mobile) [${locale}] ==`);
  const customerCtx = await browser.newContext({ viewport: MOBILE, locale, isMobile: true, hasTouch: true });
  await captureBatch(customerCtx, locale, "customer", CUSTOMER_SHOTS, MOBILE, loginCustomer(locale));
  await customerCtx.close();
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });

  console.log(`Capturing screenshots against ${BASE} ...`);

  const browser = await chromium.launch();

  for (const locale of ["ko", "vi"] as const) {
    await captureLocale(browser, locale);
  }

  await browser.close();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
