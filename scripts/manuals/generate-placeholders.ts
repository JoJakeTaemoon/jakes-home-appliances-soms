/**
 * Generate placeholder PNG screenshots so the PDF build produces a
 * complete-looking output even before the real screenshots have been
 * captured via `npm run manuals:screenshots` against a live dev server.
 *
 * Each placeholder is a clean white card with the screenshot name and a
 * small "placeholder" tag. Once real screenshots are captured they
 * overwrite these placeholders.
 *
 * Usage:  npx tsx scripts/manuals/generate-placeholders.ts
 */

import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SHOTS = path.join(ROOT, "docs/manuals/screenshots");

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 412, height: 915 };

interface Shot {
  name: string;
  caption: string;
  viewport: { width: number; height: number };
}

const OFFICE_SHOTS: Shot[] = [
  { name: "01-login", caption: "/o/login — Office Login", viewport: DESKTOP },
  { name: "02-dashboard", caption: "/o/dashboard — Dashboard", viewport: DESKTOP },
  { name: "03-customers-list", caption: "/o/customers — Customer List", viewport: DESKTOP },
  { name: "04-customers-new", caption: "/o/customers/new — New Customer", viewport: DESKTOP },
  { name: "05-contracts-list", caption: "/o/contracts — Contract List", viewport: DESKTOP },
  { name: "06-contracts-new", caption: "/o/contracts/new — New Contract", viewport: DESKTOP },
  { name: "07-visits-list", caption: "/o/visits — Visit List", viewport: DESKTOP },
  { name: "08-visits-new", caption: "/o/visits/new — New Visit", viewport: DESKTOP },
  { name: "09-service-requests", caption: "/o/service-requests — Service Requests", viewport: DESKTOP },
  { name: "10-payments", caption: "/o/payments — Payments", viewport: DESKTOP },
  { name: "11-tax-invoices", caption: "/o/tax-invoices — Tax Invoices", viewport: DESKTOP },
  { name: "12-reports-audit", caption: "/o/reports/audit — Audit Log", viewport: DESKTOP },
  { name: "13-admin-users", caption: "/o/admin/users — User Management", viewport: DESKTOP },
  { name: "14-admin-products", caption: "/o/admin/products — Product Catalog", viewport: DESKTOP },
  { name: "15-admin-scheduler-weights", caption: "/o/admin/scheduler-weights — Scheduler Weights", viewport: DESKTOP },
];

const FIELD_SHOTS: Shot[] = [
  { name: "01-login", caption: "/f/login — Field Login (mobile)", viewport: MOBILE },
  { name: "02-today", caption: "/f/today — Today's Visits", viewport: MOBILE },
  { name: "03-upcoming", caption: "/f/upcoming — Upcoming", viewport: MOBILE },
  { name: "04-profile", caption: "/f/profile — My Profile", viewport: MOBILE },
];

const CUSTOMER_SHOTS: Shot[] = [
  { name: "01-login", caption: "/login — Customer Login (mobile)", viewport: MOBILE },
  { name: "02-home", caption: "/ — Customer Home", viewport: MOBILE },
  { name: "03-equipment", caption: "/equipment — My Equipment", viewport: MOBILE },
  { name: "04-visits", caption: "/visits — Visit History", viewport: MOBILE },
  { name: "05-requests", caption: "/requests — Service Requests", viewport: MOBILE },
  { name: "06-requests-new", caption: "/requests/new — New Request", viewport: MOBILE },
  { name: "07-invoices", caption: "/invoices — Tax Invoices", viewport: MOBILE },
  { name: "08-payments", caption: "/payments — Payments", viewport: MOBILE },
  { name: "09-contacts", caption: "/contacts — Manage Contacts", viewport: MOBILE },
  { name: "10-settings", caption: "/settings — Settings", viewport: MOBILE },
];

const PLACEHOLDER_HTML = (caption: string, viewport: { width: number; height: number }, isMobile: boolean) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: "Noto Sans KR", "Apple SD Gothic Neo", -apple-system, system-ui, sans-serif;
    width: ${viewport.width}px;
    height: ${viewport.height}px;
    background: linear-gradient(135deg, #fafafa 0%, #f0f4f8 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(0,42,77,0.08);
    padding: ${isMobile ? '32px 24px' : '60px 80px'};
    text-align: center;
    border: 2px dashed #cbd5e0;
    max-width: 90%;
  }
  .badge {
    display: inline-block;
    background: #e0f2fe;
    color: #0a5da8;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 16px;
  }
  .icon {
    font-size: ${isMobile ? '48px' : '72px'};
    margin-bottom: 16px;
    opacity: 0.5;
  }
  .caption {
    font-size: ${isMobile ? '14px' : '18px'};
    font-weight: 600;
    color: #002a4d;
    margin: 0 0 12px;
  }
  .note {
    font-size: ${isMobile ? '11px' : '13px'};
    color: #737373;
    line-height: 1.5;
    max-width: ${isMobile ? '300px' : '500px'};
    margin: 0 auto;
  }
  .brand {
    margin-top: ${isMobile ? '20px' : '32px'};
    font-size: ${isMobile ? '10px' : '12px'};
    color: #a3a3a3;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">Placeholder</div>
    <div class="icon">📸</div>
    <p class="caption">${caption}</p>
    <p class="note">실제 스크린샷은 dev 서버 + DB seed 후<br/><code>npm run manuals:screenshots</code> 실행 시 자동으로 이 자리에 덮어쓰여집니다.</p>
    <div class="brand">Seoul Aqua SOMS</div>
  </div>
</body>
</html>`;

async function generateOne(
  browser: import("@playwright/test").Browser,
  outDir: string,
  shot: Shot,
): Promise<string> {
  const isMobile = shot.viewport.width < 600;
  const page = await browser.newPage({ viewport: shot.viewport });
  await page.setContent(PLACEHOLDER_HTML(shot.caption, shot.viewport, isMobile));
  await page.waitForTimeout(50);
  const outPath = path.join(outDir, `${shot.name}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  await page.close();
  return outPath;
}

async function main() {
  const browser = await chromium.launch();
  try {
    for (const [groupName, shots] of [
      ["office", OFFICE_SHOTS],
      ["field", FIELD_SHOTS],
      ["customer", CUSTOMER_SHOTS],
    ] as const) {
      const outDir = path.join(SHOTS, groupName);
      await fs.mkdir(outDir, { recursive: true });
      console.log(`== ${groupName} (${shots.length} placeholders) ==`);
      for (const s of shots) {
        const out = await generateOne(browser, outDir, s);
        process.stdout.write(`  ${path.relative(ROOT, out)} ✓\n`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
