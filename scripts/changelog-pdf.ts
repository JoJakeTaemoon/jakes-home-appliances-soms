/**
 * Regenerate change_log.pdf from change_log.md with screenshots embedded.
 *
 * change_log.pdf is a git-ignored generated artifact (see .gitignore) — the
 * markdown is the source of truth, and this script rebuilds the shareable PDF
 * on demand: `npm run changelog:pdf`.
 *
 * Mirrors scripts/manuals/build-pdf.ts: @playwright/test chromium + markdown-it
 * + setContent(). Local images (docs/screenshots/*) are inlined as base64 data
 * URIs because a setContent() page with a file:// <base> still blocks image
 * loads — self-contained data URIs render reliably.
 */
import { chromium } from "@playwright/test";
import MarkdownIt from "markdown-it";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mdPath = path.join(root, "change_log.md");
const pdfPath = path.join(root, "change_log.pdf");

const md = new MarkdownIt({ html: true, linkify: true });
let body = md.render(fs.readFileSync(mdPath, "utf8"));

// Inline local screenshots as base64 so the PDF is self-contained.
let inlined = 0;
body = body.replace(/src="(docs\/screenshots\/[^"]+)"/g, (_m, rel: string) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.warn(`  ⚠ missing image, left as-is: ${rel}`);
    return `src="${rel}"`;
  }
  inlined += 1;
  return `src="data:image/png;base64,${fs.readFileSync(abs).toString("base64")}"`;
});

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
         color: #1a1a1a; line-height: 1.65; font-size: 12.5px; }
  h1 { font-size: 22px; border-bottom: 3px solid #1657c8; padding-bottom: 8px; color: #002A4D; }
  h2 { font-size: 16px; margin-top: 26px; color: #002A4D; border-left: 4px solid #1657c8; padding-left: 8px; }
  h3 { font-size: 13.5px; margin-top: 16px; color: #1657c8; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 22px 0; }
  blockquote { border-left: 3px solid #d4d4d4; margin: 12px 0; padding: 4px 12px; color: #555; background: #fafafa; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 4px; font-size: 0.92em; }
  ul { padding-left: 20px; }
  li { margin: 3px 0; }
  img { max-width: 100%; height: auto; border: 1px solid #e5e5e5; border-radius: 6px;
        margin: 10px 0; display: block; break-inside: avoid; }
  strong { color: #111; }
</style></head><body>${body}</body></html>`;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
  } finally {
    await browser.close();
  }
  console.log(`✓ change_log.pdf regenerated (${inlined} screenshot(s) inlined)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
