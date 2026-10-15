/**
 * Capture SOMS UI screenshots for the user manuals.
 *
 * Usage:
 *   npm run db:reset:dev          (dev DB only — never production)
 *   npm run dev                   (in another terminal — leave running)
 *   npx tsx scripts/manuals/capture-screenshots.ts [office|field|customer ...]
 *   SHOTS=06-customer-salesrep-picker,04-visit-detail npx tsx …   (re-take only these)
 *   LOCALES=vi npx tsx …                                          (one language only)
 *
 * What it does:
 *   1. Connects to http://localhost:3000
 *   2. For each locale (ko, vi), logs in as each realm's seed user (ADMIN /
 *      TECHNICIAN / CONTRACT_PARTY)
 *   3. Opens every screen the manuals show, runs the shot's `prepare` step
 *      (open a tab, a modal, a dropdown, expand a row) and snaps it
 *   4. Saves PNGs under docs/manuals/screenshots/{ko,vi}/{office,field,customer}/
 *      with the exact file names the manuals reference.
 *
 * Record ids come straight from the seeded DB (fixed customer codes, the
 * seed sales rep, …), so every run lands on the same records. Button and
 * tab labels are read from src/messages/{locale}.json, so the same `prepare`
 * step works in both languages.
 */

import "dotenv/config";
import { chromium, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";

const ROOT = path.resolve(__dirname, "../..");
const SHOTS = path.join(ROOT, "docs/manuals/screenshots");
const BASE = process.env.MANUAL_BASE_URL ?? "http://localhost:3000";

const ONLY = process.env.SHOTS?.split(",");

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 412, height: 915 }; // Pixel 5-ish

const SEED = {
  office: { phone: "012345678", password: "12341234" },
  field: { phone: "0123456783", password: "12341234" },
  // Per-locale customer accounts so the vi contact's forced password change
  // does not break the ko run. KH00003 is the seed contact with KO language.
  customer: {
    ko: { phone: "0901555000", password: "portal1234" },
    vi: { phone: "0901234567", password: "portal1234" },
  },
};

type Locale = "ko" | "vi";
type Realm = "office" | "field" | "customer";

interface Ids {
  b2bCustomer: string;
  portalCustomer: string;
  salesRep: string;
  contract: string;
  equipment: string;
  serviceRequest: string;
  techId: string;
  officeVisit: string;
  fieldVisit: string;
  fieldInProgress: string;
  fieldShared: string;
  portalRequest: string;
  portalEquipment: string;
  portalVisit: string;
}

interface Ctx {
  locale: Locale;
  ids: Ids;
  today: string;
  /** Label from src/messages/{locale}.json, placeholders stripped. */
  tr: (key: string) => string;
}

interface Shot {
  name: string;
  /** Relative URL; `{L}` = locale, `{id.x}` = Ids[x], `{TODAY}`. */
  url: string;
  viewport?: { width: number; height: number };
  fullPage?: boolean;
  /** Crop to this element instead of the viewport. */
  clip?: string;
  /** Clicks/scrolls that reveal the state the manual describes. */
  prepare?: (page: Page, ctx: Ctx) => Promise<void>;
}

// ── prepare helpers ───────────────────────────────────────────────────────

const tab = (key: string) => async (page: Page, ctx: Ctx) => {
  await page
    .getByRole("tab", { name: ctx.tr(key), exact: true })
    .first()
    .click();
  await page.waitForTimeout(1200);
};

const button = (key: string) => async (page: Page, ctx: Ctx) => {
  await page
    .getByRole("button", { name: ctx.tr(key) })
    .first()
    .click();
  await page.waitForTimeout(1000);
};

const firstRow =
  (scope = "main") =>
  async (page: Page) => {
    await page.locator(`${scope} tbody tr`).first().click();
    await page.waitForTimeout(1200);
  };

const scrollTo = (key: string) => async (page: Page, ctx: Ctx) => {
  await page
    .getByText(ctx.tr(key))
    .first()
    .evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -72); // clear the sticky header
    });
  await page.waitForTimeout(400);
};

const seq =
  (...steps: ((page: Page, ctx: Ctx) => Promise<void>)[]) =>
  async (page: Page, ctx: Ctx) => {
    for (const s of steps) await s(page, ctx);
  };

const productsTab = (key: string, expand = false) =>
  seq(tab(`admin.products.${key}`), ...(expand ? [firstRow()] : []));

// ── shot lists (names = what the manuals reference) ───────────────────────

const OFFICE_SHOTS: Shot[] = [
  { name: "02-dashboard", url: "/o/{L}/dashboard" },
  {
    name: "03-sidebar",
    url: "/o/{L}/dashboard",
    viewport: { width: 1440, height: 1250 },
    clip: "aside",
  },
  { name: "04-customers-list", url: "/o/{L}/customers" },
  { name: "05-customer-new", url: "/o/{L}/customers/new", fullPage: true },
  {
    name: "06-customer-salesrep-picker",
    url: "/o/{L}/customers/new",
    prepare: async (page, ctx) => {
      const field = page
        .locator(`div:has(> label:text-is("${ctx.tr("customers.salesRep")}"))`)
        .first();
      await field.scrollIntoViewIfNeeded();
      await field.locator("button").first().click();
      await page.waitForTimeout(400);
      await page.locator(":focus").fill("Trần Quốc Bảo");
      await page.waitForTimeout(600);
    },
  },
  {
    name: "07-customer-detail-overview",
    url: "/o/{L}/customers/{id.b2bCustomer}",
  },
  {
    name: "08-customer-equipment-tab",
    url: "/o/{L}/customers/{id.b2bCustomer}?tab=equipment",
    prepare: firstRow(),
  },
  {
    name: "09-customer-contacts-tab",
    url: "/o/{L}/customers/{id.b2bCustomer}?tab=contacts",
  },
  {
    name: "10-customer-purchase-tab",
    url: "/o/{L}/customers/{id.b2bCustomer}?tab=purchase",
  },
  {
    name: "11-customer-orders-tab",
    url: "/o/{L}/customers/{id.b2bCustomer}?tab=sales-orders",
  },
  {
    name: "12-customer-edit-portal-password",
    url: "/o/{L}/customers/{id.portalCustomer}/edit",
    prepare: scrollTo("customers.resetPortalPasswordHint"),
  },
  { name: "13-sales-reps-list", url: "/o/{L}/sales-reps" },
  {
    name: "14-sales-rep-modal",
    url: "/o/{L}/sales-reps",
    prepare: button("salesReps.addRep"),
  },
  { name: "15-sales-rep-detail", url: "/o/{L}/sales-reps/{id.salesRep}" },
  {
    name: "16-sales-rep-receivables-tab",
    url: "/o/{L}/sales-reps/{id.salesRep}",
    prepare: tab("salesReps.tabs.receivables"),
  },
  { name: "17-equipment-list", url: "/o/{L}/equipment" },
  { name: "18-equipment-detail", url: "/o/{L}/equipment/{id.equipment}" },
  { name: "19-bulk-register-step1", url: "/o/{L}/equipment/bulk-register" },
  {
    name: "20-installation-history",
    url: "/o/{L}/equipment/installation-history",
  },
  { name: "21-contracts-list", url: "/o/{L}/contracts" },
  { name: "22-contract-detail", url: "/o/{L}/contracts/{id.contract}" },
  { name: "23-visits-list", url: "/o/{L}/visits" },
  { name: "24-visit-detail", url: "/o/{L}/visits/{id.officeVisit}" },
  { name: "25-visit-new", url: "/o/{L}/visits/new" },
  { name: "26-schedule-board", url: "/o/{L}/schedule-board" },
  {
    name: "27-visits-print",
    url: "/o/{L}/visits/print?date={TODAY}&technicianId={id.techId}",
  },
  { name: "28-service-requests-list", url: "/o/{L}/service-requests" },
  {
    name: "29-service-request-detail",
    url: "/o/{L}/service-requests/{id.serviceRequest}",
  },
  { name: "30-payments-list", url: "/o/{L}/payments" },
  { name: "31-tax-invoices", url: "/o/{L}/tax-invoices" },
  { name: "32-reports", url: "/o/{L}/reports" },
  { name: "33-audit-log", url: "/o/{L}/reports/audit" },
  { name: "34-admin-users", url: "/o/{L}/admin/users" },
  {
    // Opens the confirm step only — the reset itself is never clicked.
    name: "35-admin-user-reset",
    url: "/o/{L}/admin/users",
    prepare: async (page, ctx) => {
      await page
        .getByRole("button", { name: ctx.tr("admin.users.resetPassword") })
        .last()
        .click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: "36-products-brands",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabBrands", true),
  },
  {
    name: "37-products-categories",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabCategories", true),
  },
  {
    name: "38-products-types",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabProductTypes", true),
  },
  {
    name: "39-products-type-modal",
    url: "/o/{L}/admin/products",
    prepare: seq(
      productsTab("tabProductTypes"),
      button("admin.products.addProductType"),
    ),
  },
  {
    name: "40-products-models",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabModels", true),
  },
  {
    name: "41-products-model-form",
    url: "/o/{L}/admin/products",
    prepare: seq(productsTab("tabModels"), async (page, ctx) => {
      await page
        .getByRole("button", {
          name: new RegExp(`^${ctx.tr("admin.products.actNew")}`),
        })
        .first()
        .click();
      await page.waitForTimeout(800);
      await page.locator("[role=combobox]").first().click();
      await page.waitForTimeout(600);
    }),
  },
  {
    name: "42-products-consumables",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabConsumables", true),
  },
  {
    name: "43-products-accessories",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabAccessories"),
  },
  {
    name: "44-products-charges",
    url: "/o/{L}/admin/products",
    prepare: productsTab("tabCharges"),
  },
  { name: "45-company-contact", url: "/o/{L}/admin/company-contact" },
  {
    name: "46-notification-templates",
    url: "/o/{L}/admin/notification-templates",
  },
  { name: "47-notification-logs", url: "/o/{L}/admin/notification-logs" },
  {
    name: "48-notification-compose",
    url: "/o/{L}/admin/notification-logs",
    prepare: button("admin.notificationLogs.compose"),
  },
  { name: "49-migration", url: "/o/{L}/admin/migration" },
  {
    // Confirm step only — the account is never actually opened.
    name: "50-customer-open-portal",
    url: "/o/{L}/customers/{id.b2bCustomer}?tab=contacts",
    prepare: button("customers.openPortal"),
  },
  { name: "51-change-password", url: "/o/{L}/change-password" },
];

// Completion wizard (field) — walk to step n without submitting, so the
// seed visit stays IN_PROGRESS for the next locale.
const wizardTo = (n: number) => async (page: Page, ctx: Ctx) => {
  await page.locator("textarea").first().fill(ctx.locale === "ko" ? "필터 3종 교체, 누수 점검 이상 없음" : "Đã thay 3 lõi lọc, kiểm tra rò rỉ bình thường");
  for (let step = 1; step < n; step++) {
    await page.getByRole("button", { name: ctx.tr("mobile.complete.next"), exact: true }).click();
    await page.waitForTimeout(700);
    if (step + 1 === 3) {
      await page.locator('input[type="file"]').first().setInputFiles(path.join(ROOT, "public/sample-images/1.png"));
      await page.waitForTimeout(2500);
    }
  }
  if (n === 4) {
    await page.locator(`div:has(> label:has-text("${ctx.tr("mobile.complete.collected")}")) input`).first().fill("500000");
    await page.waitForTimeout(500);
  }
};

const FIELD_SHOTS: Shot[] = [
  { name: "02-today", url: "/f/{L}/today" },
  { name: "03-upcoming", url: "/f/{L}/upcoming" },
  { name: "04-visit-detail", url: "/f/{L}/visits/{id.fieldVisit}" },
  { name: "05-visit-docs", url: "/f/{L}/visits/{id.fieldVisit}", prepare: scrollTo("mobile.signRequired") },
  { name: "06-visit-work", url: "/f/{L}/visits/{id.fieldVisit}", prepare: scrollTo("mobile.workScope.title") },
  { name: "07-visit-note-actions", url: "/f/{L}/visits/{id.fieldVisit}", prepare: scrollTo("mobile.officeNote.title") },
  { name: "08-visit-shared", url: "/f/{L}/visits/{id.fieldShared}", prepare: scrollTo("mobile.officeNote.title") },
  { name: "09-complete-work", url: "/f/{L}/visits/{id.fieldInProgress}/complete", prepare: wizardTo(1), fullPage: true },
  { name: "10-complete-photos", url: "/f/{L}/visits/{id.fieldInProgress}/complete", prepare: wizardTo(2) },
  { name: "11-complete-signature", url: "/f/{L}/visits/{id.fieldInProgress}/complete", prepare: wizardTo(3) },
  { name: "12-complete-payment", url: "/f/{L}/visits/{id.fieldInProgress}/complete", prepare: wizardTo(4) },
  { name: "13-complete-review", url: "/f/{L}/visits/{id.fieldInProgress}/complete", prepare: wizardTo(5), fullPage: true },
  { name: "14-profile", url: "/f/{L}/profile" },
  {
    // Opens the modal and picks a reason — never confirms.
    name: "15-visit-fail",
    url: "/f/{L}/visits/{id.fieldVisit}",
    prepare: seq(button("mobile.actions.fail"), async (page, ctx) => {
      await page.getByText(ctx.tr("mobile.fail.reasons.NO_SHOW"), { exact: true }).click();
      await page.waitForTimeout(300);
    }),
  },
];

// Portal service-request wizard — stops before 제출.
const requestTo = (n: number) => async (page: Page, ctx: Ctx) => {
  const next = () => page.getByRole("button", { name: ctx.tr("portal.requests.next"), exact: true }).click();
  // Skip off-catalog units — the portal shows them as "—".
  await page.locator("main section li button").filter({ hasNotText: "—" }).first().click();
  if (n === 1) return;
  await next();
  await page.waitForTimeout(500);
  await page.locator("main section button").first().click();
  if (n === 2) return;
  await next();
  await page.locator("textarea").first().fill(ctx.locale === "ko" ? "물이 잘 나오지 않고 소음이 납니다. 점검 부탁드립니다." : "Nước chảy yếu và máy kêu to, nhờ kiểm tra giúp.");
  for (let step = 3; step < n; step++) {
    await next();
    await page.waitForTimeout(500);
  }
};

const CUSTOMER_SHOTS: Shot[] = [
  { name: "02-home", url: "/{L}" },
  { name: "03-equipment", url: "/{L}/equipment" },
  { name: "04-equipment-detail", url: "/{L}/equipment/{id.portalEquipment}", fullPage: true },
  { name: "05-visits", url: "/{L}/visits" },
  { name: "06-visit-detail", url: "/{L}/visits/{id.portalVisit}", fullPage: true },
  { name: "07-requests", url: "/{L}/requests" },
  { name: "08-request-detail", url: "/{L}/requests/{id.portalRequest}", fullPage: true },
  { name: "09-request-step1", url: "/{L}/requests/new", prepare: requestTo(1) },
  { name: "10-request-step2", url: "/{L}/requests/new", prepare: requestTo(2) },
  { name: "11-request-review", url: "/{L}/requests/new", prepare: requestTo(5), fullPage: true },
  { name: "12-payments", url: "/{L}/payments" },
  { name: "13-contacts", url: "/{L}/contacts" },
  { name: "14-settings", url: "/{L}/settings", fullPage: true },
  { name: "15-change-password", url: "/{L}/change-password" },
];

const LOGIN_URL: Record<Realm, string> = {
  office: "/o/{L}/login",
  field: "/f/{L}/login",
  customer: "/{L}/login",
};

// ── ids, labels, urls ─────────────────────────────────────────────────────

async function loadIds(): Promise<Ids> {
  const customer = (code: string) =>
    prisma.customer
      .findFirstOrThrow({ where: { code }, select: { id: true } })
      .then((c) => c.id);
  const b2bCustomer = await customer("KH00002");
  const portalCustomer = await customer("KH00001");
  const koCustomer = await customer("KH00003");
  const tech = await prisma.user.findFirstOrThrow({
    where: { phone: SEED.field.phone },
    select: { id: true },
  });
  const pickVisit = async (where: object) =>
    (
      await prisma.visit.findFirst({
        where,
        orderBy: { scheduledFor: "asc" },
        select: { id: true },
      })
    )?.id;
  return {
    b2bCustomer,
    portalCustomer,
    salesRep: (
      await prisma.salesRep.findFirstOrThrow({ where: { name: "Lê Văn An" } })
    ).id,
    contract: (
      await prisma.contract.findFirstOrThrow({
        where: { customerId: b2bCustomer, state: "ACTIVE" },
      })
    ).id,
    equipment: (
      await prisma.equipment.findFirstOrThrow({
        where: { customerId: b2bCustomer },
      })
    ).id,
    serviceRequest: (
      await prisma.serviceRequest.findFirstOrThrow({
        orderBy: { createdAt: "desc" },
      })
    ).id,
    techId: tech.id,
    officeVisit: "seed-visit-doc-delivery-receipt",
    fieldVisit: "seed-visit-b2c-today", // PERIODIC, SCHEDULED, tech1 lead, unit with filters
    fieldInProgress: "seed-visit-bulk-120", // PERIODIC, IN_PROGRESS, tech1 lead
    fieldShared: "seed-visit-bulk-114", // tech1 is collaborator
    portalRequest: (await prisma.serviceRequest.findFirstOrThrow({ where: { customerId: koCustomer } })).id,
    portalEquipment: (
      await prisma.equipment.findFirstOrThrow({
        where: { customerId: koCustomer },
      })
    ).id,
    portalVisit: (await pickVisit({ customerId: koCustomer, state: "COMPLETED" })) ?? (await pickVisit({ customerId: koCustomer })) ?? "",
  };
}

function translator(locale: Locale) {
  const messages = JSON.parse(
    fs.readFileSync(path.join(ROOT, `src/messages/${locale}.json`), "utf8"),
  );
  return (key: string) => {
    const v = key.split(".").reduce((o, k) => o?.[k], messages);
    if (typeof v !== "string")
      throw new Error(`missing message ${locale}:${key}`);
    return v.replace(/\s*\{[^}]+\}\s*/g, " ").trim();
  };
}

function resolveUrl(template: string, ctx: Ctx): string {
  return template
    .replaceAll("{L}", ctx.locale)
    .replaceAll("{TODAY}", ctx.today)
    .replace(/\{id\.(\w+)\}/g, (_, k: keyof Ids) => ctx.ids[k]);
}

function todayInVST(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

// ── browser plumbing ──────────────────────────────────────────────────────

/** Hide the Next.js dev overlay — never part of the product UI. */
async function hideDevOverlay(page: Page) {
  await page.addStyleTag({
    content: `nextjs-portal, [data-nextjs-toast], [data-nextjs-toast-wrapper],
      [data-nextjs-dialog-overlay], [data-nextjs-build-indicator], [data-next-mark],
      #__next-build-watcher { display: none !important; }`,
  });
}

async function settle(page: Page) {
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(700);
}

/**
 * Fills phone + password, waits for the login API to answer 200 and the
 * redirect away from /login. Throws so a broken login is loud instead of
 * silently re-capturing the login screen.
 */
async function login(page: Page, realm: Realm, locale: Locale) {
  const creds = realm === "customer" ? SEED.customer[locale] : SEED[realm];
  const api = {
    office: /\/api\/auth\/login/,
    field: /\/api\/auth\/field\/login/,
    customer: /\/api\/portal\/auth\/login/,
  }[realm];
  await page.goto(`${BASE}${LOGIN_URL[realm].replace("{L}", locale)}`);
  const phone = page
    .locator('#phone, #identifier, input[type="tel"], input[inputmode="tel"]')
    .first();
  await phone.waitFor({ state: "visible", timeout: 15_000 });
  await phone.fill(creds.phone);
  await page.locator('input[type="password"]').first().fill(creds.password);
  const resp = page.waitForResponse(
    (r) => api.test(r.url()) && r.request().method() === "POST",
    { timeout: 20_000 },
  );
  await page.locator('button[type="submit"]').first().click();
  const status = (await resp).status();
  // A previous run already changed the vi contact's password (see below).
  if (status === 401 && realm === "customer" && !creds.password.endsWith("x")) {
    creds.password += "x";
    return login(page, realm, locale);
  }
  if (status !== 200) throw new Error(`${realm} login answered ${status}`);
  await page.waitForURL((u) => !/\/login$/.test(u.pathname), {
    timeout: 15_000,
  });

  // The vi seed contact must change its password on first login.
  if (/\/change-password/.test(page.url())) {
    const next = creds.password + "x";
    await page.locator("input#cur").fill(creds.password);
    await page.locator("input#new").fill(next);
    await page.locator("input#cnf").fill(next);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !/\/change-password/.test(u.pathname), {
      timeout: 15_000,
    });
    creds.password = next;
  }
  await page.waitForTimeout(400);
}

async function snap(page: Page, shot: Shot, file: string) {
  await hideDevOverlay(page).catch(() => undefined);
  await page.waitForTimeout(150);
  if (shot.clip) {
    await page.locator(shot.clip).first().screenshot({ path: file });
  } else {
    await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });
  }
}

async function captureRealm(
  context: BrowserContext,
  realm: Realm,
  shots: Shot[],
  ctx: Ctx,
  viewport: { width: number; height: number },
) {
  const outDir = path.join(SHOTS, ctx.locale, realm);
  await fsp.mkdir(outDir, { recursive: true });
  const page = await context.newPage();
  await page.setViewportSize(viewport);

  // Login screen first, while still signed out.
  if (!ONLY) {
    await page.goto(`${BASE}${LOGIN_URL[realm].replace("{L}", ctx.locale)}`);
    await settle(page);
    await snap(
      page,
      { name: "01-login", url: "" },
      path.join(outDir, "01-login.png"),
    );
    console.log(`  ${ctx.locale}/${realm}/01-login ✓`);
  }

  await login(page, realm, ctx.locale);

  for (const shot of shots) {
    if (ONLY && !ONLY.includes(shot.name)) continue;
    await page.setViewportSize(shot.viewport ?? viewport);
    const file = path.join(outDir, `${shot.name}.png`);
    try {
      const url = `${BASE}${resolveUrl(shot.url, ctx)}`;
      await page.goto(url);
      await settle(page);
      // An auth-cookie race can bounce the first hit to /login — sign in again.
      if (/\/login$/.test(new URL(page.url()).pathname)) {
        await login(page, realm, ctx.locale);
        await page.goto(url);
        await settle(page);
      }
      if (shot.prepare) await shot.prepare(page, ctx);
      await snap(page, shot, file);
      console.log(`  ${ctx.locale}/${realm}/${shot.name} ✓`);
    } catch (e) {
      console.log(
        `  ${ctx.locale}/${realm}/${shot.name} ✗ ${(e as Error).message.split("\n")[0]}`,
      );
    }
  }
  await page.close();
}

async function main() {
  const only = process.argv.slice(2) as Realm[];
  const want = (r: Realm) => only.length === 0 || only.includes(r);
  const ids = await loadIds();
  const browser = await chromium.launch();

  const locales = (process.env.LOCALES?.split(",") ?? ["ko", "vi"]) as Locale[];
  for (const locale of locales) {
    console.log(`\n══ ${locale} ══`);
    const ctx: Ctx = {
      locale,
      ids,
      today: todayInVST(),
      tr: translator(locale),
    };
    if (want("office")) {
      const c = await browser.newContext({ viewport: DESKTOP, locale });
      await captureRealm(c, "office", OFFICE_SHOTS, ctx, DESKTOP);
      await c.close();
    }
    if (want("field")) {
      const c = await browser.newContext({
        viewport: MOBILE,
        locale,
        isMobile: true,
        hasTouch: true,
      });
      await captureRealm(c, "field", FIELD_SHOTS, ctx, MOBILE);
      await c.close();
    }
    if (want("customer")) {
      const c = await browser.newContext({
        viewport: MOBILE,
        locale,
        isMobile: true,
        hasTouch: true,
      });
      await captureRealm(c, "customer", CUSTOMER_SHOTS, ctx, MOBILE);
      await c.close();
    }
  }

  await browser.close();
  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
