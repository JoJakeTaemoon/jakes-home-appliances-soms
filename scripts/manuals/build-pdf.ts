/**
 * Markdown manual → pageless PDF builder.
 *
 * Usage:
 *   npx tsx scripts/manuals/build-pdf.ts [manual-path ...]
 *
 * With no args: builds all 6 manuals under docs/manuals/{ko,vi}/{office,field,customer}.md
 *
 * "Pageless" means: PDF height matches rendered content height (no
 * artificial A4/Letter breaks). Margins are kept small for screen
 * reading. Mermaid blocks are rendered client-side via mermaid.js
 * (bundled inline) before page.pdf() snapshots.
 *
 * Output: docs/manuals/pdf/{office,field,customer}-{ko,vi}.pdf
 */

import { chromium } from "@playwright/test";
import MarkdownIt from "markdown-it";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const MANUALS_DIR = path.join(ROOT, "docs/manuals");
const OUTPUT_DIR = path.join(MANUALS_DIR, "pdf");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  typographer: true,
});

const HTML_TEMPLATE = (title: string, body: string) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @font-face {
    font-family: "Noto Sans KR";
    src: local("Noto Sans KR"), local("Apple SD Gothic Neo"), local("Malgun Gothic"), local("Nanum Gothic");
  }
  :root {
    --brand-blue: #002a4d;
    --brand-blue-500: #0a5da8;
    --ink: #1a1a1a;
    --muted: #525252;
    --rule: #e5e5e5;
    --bg: #fafafa;
    --code-bg: #f3f4f6;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Nanum Gothic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 32px 40px;
    line-height: 1.65;
    font-size: 13.5px;
    background: #fff;
  }
  h1, h2, h3, h4 {
    color: var(--brand-blue);
    margin-top: 1.6em;
    margin-bottom: 0.6em;
    line-height: 1.3;
    page-break-after: avoid;
  }
  h1 { font-size: 28px; border-bottom: 3px solid var(--brand-blue); padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 22px; border-bottom: 1px solid var(--rule); padding-bottom: 4px; margin-top: 2.2em; }
  h3 { font-size: 17px; }
  h4 { font-size: 14.5px; color: var(--brand-blue-500); }
  p { margin: 0.6em 0; }
  a { color: var(--brand-blue-500); text-decoration: underline; }
  code {
    font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
    background: var(--code-bg);
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  pre {
    background: var(--code-bg);
    padding: 12px 16px;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid var(--rule);
  }
  pre code { background: none; padding: 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 0.92em;
  }
  th, td {
    border: 1px solid var(--rule);
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
  }
  th { background: var(--bg); font-weight: 600; color: var(--brand-blue); }
  blockquote {
    border-left: 4px solid var(--brand-blue-500);
    background: #f5fbff;
    margin: 1em 0;
    padding: 8px 16px;
    color: var(--muted);
  }
  blockquote p { margin: 0.4em 0; }
  ul, ol { padding-left: 1.6em; }
  li { margin: 0.25em 0; }
  hr { border: none; border-top: 1px solid var(--rule); margin: 2em 0; }
  img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--rule);
    border-radius: 6px;
    margin: 1em 0;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
  }
  figure {
    margin: 1.5em 0;
    text-align: center;
  }
  figcaption {
    font-size: 0.88em;
    color: var(--muted);
    margin-top: 6px;
    font-style: italic;
  }
  .mermaid {
    text-align: center;
    margin: 1.2em 0;
    page-break-inside: avoid;
  }
  .callout-warn {
    background: #fff7e6;
    border-left: 4px solid #d97706;
    padding: 10px 14px;
    margin: 1em 0;
    border-radius: 4px;
  }
  .callout-info {
    background: #f0f9ff;
    border-left: 4px solid #0a5da8;
    padding: 10px 14px;
    margin: 1em 0;
    border-radius: 4px;
  }
  .callout-danger {
    background: #fef2f2;
    border-left: 4px solid #dc2626;
    padding: 10px 14px;
    margin: 1em 0;
    border-radius: 4px;
  }
  .footer {
    margin-top: 4em;
    padding-top: 1em;
    border-top: 1px solid var(--rule);
    font-size: 0.85em;
    color: var(--muted);
    text-align: center;
  }
</style>
</head>
<body>
${body}
<div class="footer">
  Seoul Aqua SOMS · 2026-06-02 발행 · 본 문서는 자동 생성 PDF입니다
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  document.querySelectorAll('pre > code.language-mermaid').forEach((codeEl) => {
    const pre = codeEl.parentElement;
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = codeEl.textContent;
    pre.replaceWith(div);
  });
  mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif',
  });
  window.__MERMAID_DONE__ = false;
  setTimeout(async () => {
    try { await mermaid.run(); } catch (e) {}
    window.__MERMAID_DONE__ = true;
  }, 200);
</script>
</body>
</html>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildOne(mdRelPath: string): Promise<string> {
  const mdAbsPath = path.join(ROOT, mdRelPath);
  const raw = await fs.readFile(mdAbsPath, "utf8");
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(mdRelPath, ".md");
  const bodyHtml = md.render(raw);
  const fullHtml = HTML_TEMPLATE(title, bodyHtml);

  // Resolve output filename: docs/manuals/ko/office.md → office-ko.pdf
  const segments = mdRelPath.split(path.sep);
  const langSeg = segments[segments.indexOf("manuals") + 1];
  const groupSeg = path.basename(mdRelPath, ".md");
  const outName = `${groupSeg}-${langSeg}.pdf`;
  const outPath = path.join(OUTPUT_DIR, outName);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 900, height: 1200 },
  });
  const page = await context.newPage();

  // Resolve relative image URLs (../screenshots/office/foo.png) by
  // pointing the HTML's base href to the manual's directory.
  const baseHref = `file://${path.dirname(mdAbsPath)}/`;
  const htmlWithBase = fullHtml.replace(
    "<head>",
    `<head>\n<base href="${baseHref}">`,
  );

  await page.setContent(htmlWithBase, { waitUntil: "networkidle" });

  // Wait until Mermaid finishes rendering (best effort).
  try {
    await page.waitForFunction(
      () => (window as unknown as { __MERMAID_DONE__: boolean }).__MERMAID_DONE__ === true,
      { timeout: 10_000 },
    );
  } catch {
    // Mermaid CDN may be blocked; proceed without it.
  }
  // Settle a beat for layout post-Mermaid.
  await page.waitForTimeout(400);

  // Measure full content height for pageless export.
  const bodyHeightPx = await page.evaluate(() => {
    return Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    );
  });

  // Convert px to mm at 96 DPI: 1 px = 0.2645833333mm.
  const heightMm = Math.ceil((bodyHeightPx + 80) * 0.2645833333);

  await page.pdf({
    path: outPath,
    width: "210mm",
    height: `${heightMm}mm`,
    printBackground: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
  });

  await browser.close();
  return outPath;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const explicit = process.argv.slice(2);
  let targets: string[];
  if (explicit.length > 0) {
    targets = explicit.map((p) => path.relative(ROOT, path.resolve(p)));
  } else {
    const groups = ["office", "field", "customer"];
    const langs = ["ko", "vi"];
    targets = [];
    for (const lang of langs) {
      for (const group of groups) {
        const rel = `docs/manuals/${lang}/${group}.md`;
        try {
          await fs.access(path.join(ROOT, rel));
          targets.push(rel);
        } catch {
          console.warn(`  skip (missing): ${rel}`);
        }
      }
    }
  }

  console.log(`Building ${targets.length} PDF(s)...`);
  for (const t of targets) {
    process.stdout.write(`  ${t} → `);
    try {
      const out = await buildOne(t);
      console.log(path.relative(ROOT, out));
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
