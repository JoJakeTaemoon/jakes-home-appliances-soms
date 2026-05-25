#!/usr/bin/env node
/**
 * Combine the two raw V8 coverage sources produced by an E2E run
 * (`npm run test:e2e:coverage`) and emit a single HTML report.
 *
 *   coverage/server/*.json   ← Node V8 coverage from the dev server
 *                              (NODE_V8_COVERAGE writes one file per
 *                              dump; ProcessCoverage CLI does the same)
 *   coverage/browser/*.json  ← Playwright JSCoverage from each test,
 *                              one file per test (the fixture in
 *                              e2e/fixtures/coverage.ts writes them)
 *
 *   coverage/report/index.html  ← merged HTML report
 *
 * v8-to-istanbul converts both V8-format payloads to istanbul format;
 * istanbul-lib-coverage merges the maps; istanbul-reports emits the
 * HTML + text-summary. We don't depend on `c8` for the reporting step
 * — that lets us treat the browser coverage as a first-class peer to
 * the server coverage rather than bolting it onto a c8 run.
 */
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = path.join(ROOT, "coverage", "server");
const BROWSER_DIR = path.join(ROOT, "coverage", "browser");
const REPORT_DIR = path.join(ROOT, "coverage", "report");
const SRC_PREFIX = path.join(ROOT, "src") + path.sep;

const map = libCoverage.createCoverageMap({});

let serverFileCount = 0;
let serverEntryCount = 0;
let browserFileCount = 0;
let browserEntryCount = 0;
let skippedNonSrc = 0;
let conversionErrors = 0;

async function listJson(dir) {
  try {
    const names = await fs.readdir(dir);
    return names.filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// V8 coverage entries from Node use `file://` URLs; entries from the
// browser use `http://localhost:3000/...`. For the merged report we
// only care about source files under `src/` — Next.js framework code,
// node_modules, and Next-generated chunks add noise without value.
function shouldIncludeUrl(u) {
  if (!u) return false;
  if (u.startsWith("file://")) {
    const filePath = url.fileURLToPath(u);
    return filePath.startsWith(SRC_PREFIX);
  }
  // Browser URLs always go through v8-to-istanbul's source-map
  // resolution — the resulting istanbul keys are filesystem paths,
  // and we filter against SRC_PREFIX at merge time below.
  return u.startsWith("http://localhost:3000/");
}

async function convertEntry(entry, sourceOverride) {
  // v8-to-istanbul signature: (scriptPath, wrapperLength, { source, sourceMap }).
  // For server entries we pass the on-disk path so v8-to-istanbul can
  // read the file (and its source map). For browser entries we pass
  // the bundled `source` text directly — v8-to-istanbul parses the
  // sourceMappingURL comment at the end of the bundle to find the map.
  const scriptPath = entry.url.startsWith("file://")
    ? url.fileURLToPath(entry.url)
    : ""; // signal "use the source override"
  const opts = sourceOverride ? { source: sourceOverride } : undefined;
  const converter = v8ToIstanbul(scriptPath, 0, opts);
  try {
    await converter.load();
  } catch (err) {
    // Source maps for some Next.js dev chunks are external URLs that
    // we can't fetch from this script; skip and move on.
    conversionErrors += 1;
    return null;
  }
  converter.applyCoverage(entry.functions);
  const fileCoverage = converter.toIstanbul();
  converter.destroy?.();
  return fileCoverage;
}

function mergeFileCoverage(fileCoverage) {
  // Only keep files under our `src/` tree — the source-map resolution
  // can drag in workspace-internal paths (e.g. node_modules pieces
  // that got inlined) which we don't want in the report.
  for (const filePath of Object.keys(fileCoverage)) {
    if (!filePath.startsWith(SRC_PREFIX)) {
      skippedNonSrc += 1;
      delete fileCoverage[filePath];
    }
  }
  if (Object.keys(fileCoverage).length === 0) return;
  map.merge(fileCoverage);
}

async function ingestServer() {
  const files = await listJson(SERVER_DIR);
  for (const file of files) {
    let payload;
    try {
      payload = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(payload?.result)) continue;
    serverFileCount += 1;
    for (const entry of payload.result) {
      if (!shouldIncludeUrl(entry.url)) continue;
      const istanbul = await convertEntry(entry);
      if (istanbul) {
        serverEntryCount += 1;
        mergeFileCoverage(istanbul);
      }
    }
  }
}

async function ingestBrowser() {
  const files = await listJson(BROWSER_DIR);
  for (const file of files) {
    let payload;
    try {
      payload = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(payload?.result)) continue;
    browserFileCount += 1;
    for (const entry of payload.result) {
      if (!shouldIncludeUrl(entry.url)) continue;
      const istanbul = await convertEntry(entry, entry.source);
      if (istanbul) {
        browserEntryCount += 1;
        mergeFileCoverage(istanbul);
      }
    }
  }
}

function emitReports() {
  const context = libReport.createContext({
    dir: REPORT_DIR,
    coverageMap: map,
    defaultSummarizer: "nested",
  });
  reports.create("html", { skipEmpty: false }).execute(context);
  reports.create("text-summary").execute(context);
  reports.create("json-summary").execute(context);
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await ingestServer();
  await ingestBrowser();

  const fileCount = map.files().length;
  if (fileCount === 0) {
    console.error(
      "[coverage-report] No coverage data found. Make sure you ran:\n" +
        "  1) npm run dev:coverage  (in another terminal)\n" +
        "  2) npm run test:e2e:coverage\n" +
        "  3) npm run coverage:report",
    );
    process.exit(1);
  }

  emitReports();
  console.log("");
  console.log(`[coverage-report] Server: ${serverFileCount} dump file(s), ${serverEntryCount} script entries merged`);
  console.log(`[coverage-report] Browser: ${browserFileCount} test file(s), ${browserEntryCount} script entries merged`);
  console.log(`[coverage-report] Skipped (non-src): ${skippedNonSrc}, conversion errors: ${conversionErrors}`);
  console.log(`[coverage-report] Combined coverage for ${fileCount} source file(s)`);
  console.log(`[coverage-report] HTML report: ${path.join(REPORT_DIR, "index.html")}`);
}

main().catch((err) => {
  console.error("[coverage-report] Fatal:", err);
  process.exit(1);
});
