/**
 * Markdown manual → pageless PDF builder (A4 landscape width).
 *
 * Usage:
 *   npx tsx scripts/manuals/build-pdf.ts [manual-path ...]
 *
 * With no args: builds all 6 manuals under docs/manuals/{ko,vi}/{office,field,customer}.md
 *
 * "Pageless" means: PDF height matches rendered content height (no
 * artificial page breaks). Width is A4 landscape (297mm) so wide
 * tables, mermaid diagrams, and screenshots fit comfortably without
 * horizontal clipping.
 *
 * Image embedding: <img src="../screenshots/...">  references are
 * inlined as data: URLs *before* Chromium loads the document. This
 * sidesteps the Chromium security policy that blocks file:// images
 * from a page served via setContent() (the previous version showed
 * empty rectangles in the PDF).
 *
 * Mermaid blocks are rendered client-side via mermaid.js (CDN) and
 * configured with useMaxWidth: true so any wide diagram auto-scales
 * down to the content column instead of overflowing the page.
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
    /* A4 landscape: 297mm wide. We render at 1100px (≈ 291mm @ 96 DPI)
       with 30px padding on each side so the effective content column
       is ~1040px — narrow enough that wide tables still wrap nicely
       but wide enough that mermaid SVGs render with legible labels. */
    --content-max: 1040px;
  }
  * { box-sizing: border-box; }
  html, body { width: 100%; max-width: 100vw; overflow-x: hidden; }
  body {
    font-family: "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Nanum Gothic", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 28px 30px;
    line-height: 1.6;
    font-size: 13px;
    background: #fff;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  h1, h2, h3, h4 {
    color: var(--brand-blue);
    margin-top: 1.4em;
    margin-bottom: 0.5em;
    line-height: 1.3;
    page-break-after: avoid;
  }
  h1 { font-size: 26px; border-bottom: 3px solid var(--brand-blue); padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 20px; border-bottom: 1px solid var(--rule); padding-bottom: 4px; margin-top: 1.8em; }
  h3 { font-size: 16px; }
  h4 { font-size: 14px; color: var(--brand-blue-500); }
  p { margin: 0.5em 0; }
  a { color: var(--brand-blue-500); text-decoration: underline; }
  code {
    font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
    background: var(--code-bg);
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.88em;
    word-break: break-all;
  }
  pre {
    background: var(--code-bg);
    padding: 10px 14px;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid var(--rule);
    max-width: 100%;
  }
  pre code { background: none; padding: 0; word-break: normal; }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 100%;
    margin: 0.8em 0;
    font-size: 0.86em;
    table-layout: auto;
    word-break: break-word;
  }
  th, td {
    border: 1px solid var(--rule);
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  th { background: var(--bg); font-weight: 600; color: var(--brand-blue); }
  blockquote {
    border-left: 4px solid var(--brand-blue-500);
    background: #f5fbff;
    margin: 0.8em 0;
    padding: 8px 14px;
    color: var(--muted);
  }
  blockquote p { margin: 0.3em 0; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.2em 0; }
  hr { border: none; border-top: 1px solid var(--rule); margin: 1.8em 0; }
  img {
    /* Screenshots: never overflow the column. Cap height so a long
       desktop screenshot does not dominate the page. */
    max-width: 100%;
    width: auto;
    height: auto;
    max-height: 720px;
    object-fit: contain;
    border: 1px solid var(--rule);
    border-radius: 6px;
    margin: 1em auto;
    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    display: block;
  }
  figure { margin: 1.4em 0; text-align: center; }
  figcaption {
    font-size: 0.85em;
    color: var(--muted);
    margin-top: 6px;
    font-style: italic;
  }
  /* Mermaid wrapper — center, never overflow the content column. */
  .mermaid {
    text-align: center;
    margin: 1.2em 0;
    max-width: 100%;
    overflow: visible;
  }
  .mermaid svg {
    max-width: 100% !important;
    height: auto !important;
    display: inline-block;
  }
  .footer {
    margin-top: 3em;
    padding-top: 0.8em;
    border-top: 1px solid var(--rule);
    font-size: 0.82em;
    color: var(--muted);
    text-align: center;
  }
</style>
</head>
<body>
${body}
<div class="footer">
  Jake's Home Appliances SOMS · 2026-06-02 발행 · 본 문서의 제작자는 Jake Taemoon Jo (whxoans@gmail.com) 입니다.
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
    flowchart: { useMaxWidth: true, htmlLabels: true, nodeSpacing: 35, rankSpacing: 45 },
    sequence: { useMaxWidth: true, mirrorActors: false, boxMargin: 8, messageMargin: 24 },
    state: { useMaxWidth: true },
    fontFamily: '"Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif',
  });
  window.__MERMAID_DONE__ = false;
  setTimeout(async () => {
    try { await mermaid.run(); } catch (e) {}
    // Clamp any oversized SVG to the content column width.
    document.querySelectorAll('.mermaid svg').forEach((svg) => {
      svg.removeAttribute('width');
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
    });
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

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/**
 * Convert <img src="relative-or-absolute-path"> tags in the rendered
 * HTML body to data: URLs. This is what makes the screenshots appear
 * inside the PDF — page.setContent() with a file:// <base> still blocks
 * file:// resources for security, so we inline the bytes instead.
 */
async function inlineImages(bodyHtml: string, mdDir: string): Promise<string> {
  const imgRe = /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g;
  const matches: { tag: string; src: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(bodyHtml)) !== null) {
    matches.push({ tag: m[0], src: m[2] });
  }
  let result = bodyHtml;
  for (const { tag, src } of matches) {
    if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) {
      continue;
    }
    const absPath = path.isAbsolute(src) ? src : path.resolve(mdDir, src);
    try {
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
      const bytes = await fs.readFile(absPath);
      const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
      const newTag = tag.replace(`src="${src}"`, `src="${dataUrl}"`);
      result = result.split(tag).join(newTag);
    } catch {
      // image missing on disk — leave the original tag so the broken
      // alt text still hints at what should be there.
    }
  }
  return result;
}

async function buildOne(mdRelPath: string): Promise<string> {
  const mdAbsPath = path.join(ROOT, mdRelPath);
  const mdDir = path.dirname(mdAbsPath);
  const raw = await fs.readFile(mdAbsPath, "utf8");
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(mdRelPath, ".md");
  const rawBody = md.render(raw);
  const bodyHtml = await inlineImages(rawBody, mdDir);
  const fullHtml = HTML_TEMPLATE(title, bodyHtml);

  // Resolve output filename: docs/manuals/ko/office.md → office-ko.pdf
  const segments = mdRelPath.split(path.sep);
  const langSeg = segments[segments.indexOf("manuals") + 1];
  const groupSeg = path.basename(mdRelPath, ".md");
  const outName = `${groupSeg}-${langSeg}.pdf`;
  const outPath = path.join(OUTPUT_DIR, outName);

  const browser = await chromium.launch();
  // A4 landscape: 297mm × 210mm = ~1123 × ~794 px @ 96 DPI.
  // We size the viewport slightly under that so scrollWidth never
  // forces horizontal scroll (which would clip in the PDF snapshot).
  const VIEW_WIDTH_PX = 1100;
  const context = await browser.newContext({
    viewport: { width: VIEW_WIDTH_PX, height: 1400 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.setContent(fullHtml, { waitUntil: "networkidle" });

  // Wait until Mermaid finishes rendering (best effort).
  try {
    await page.waitForFunction(
      () => (window as unknown as { __MERMAID_DONE__: boolean }).__MERMAID_DONE__ === true,
      { timeout: 12_000 },
    );
  } catch {
    // Mermaid CDN may be blocked; proceed without it.
  }
  // Settle a beat for layout post-Mermaid.
  await page.waitForTimeout(500);

  // Measure full content height for pageless export.
  const bodyHeightPx = await page.evaluate(() => {
    return Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
    );
  });

  // Convert px → mm at 96 DPI (1 px = 0.2645833333 mm).
  // Width: A4 landscape = 297mm.
  // Height: content height + a small bottom margin.
  const heightMm = Math.ceil((bodyHeightPx + 60) * 0.2645833333);

  await page.pdf({
    path: outPath,
    width: "297mm",
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

  console.log(`Building ${targets.length} PDF(s) ...`);
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
