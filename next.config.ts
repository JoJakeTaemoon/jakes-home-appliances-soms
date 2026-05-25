import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // `@sparticuz/chromium` ships a brotli-compressed Chromium binary under
  // `bin/`. Next.js's static-file tracer can't see binary files referenced
  // only at runtime, so the bin/ folder is left out of the deployed Vercel
  // function and PDF generation 500s with:
  //   The input directory ".../@sparticuz/chromium/bin" does not exist.
  // Force the tracer to include the whole bin/ tree for the PDF route.
  outputFileTracingIncludes: {
    "/api/daily-reports/\\[reportId\\]/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
      // Noto Sans KR for Hangul in the Korean PDF. Ships from public/fonts/
      // so generation has no runtime network dependency on a CDN.
      "./public/fonts/**",
      // Daily-report photos / drawings are read from disk at
      // `<cwd>/uploads/...` by pdf-html.ts. Without this include, Vercel's
      // function bundle has no `uploads/` directory and every photo renders
      // as a "missing" placeholder. PDFs (drawings) render as text-only
      // placeholders anyway, so we only ship image formats — keeps the
      // bundle ~5 MB instead of ~107 MB.
      "./uploads/**/*.jpg",
      "./uploads/**/*.jpeg",
      "./uploads/**/*.png",
    ],
    // `/api/uploads/[...path]/route.ts` reads file segments from request
    // params, so Next.js's tracer can't tell which files in `uploads/` are
    // needed and ships none — every photo/drawing 404'd on Vercel. Trace
    // the whole tree (~107 MB) for this route. Image and PDF both go
    // through here because the detail page renders PDFs in <iframe>.
    "/api/uploads/\\[\\.\\.\\.path\\]": [
      "./uploads/**/*",
    ],
  },
  // Next.js's NFT tracer follows `readFile(join(process.cwd(), 'uploads',
  // dynamicKey))` and, because the path is opaque, pulls the whole tree
  // into the function bundle. When PDF samples were added to the deploy
  // bundle that pushed two copy-from-yesterday routes over the 300 MB
  // function size limit. The routes don't actually need the bundled
  // tree — on Vercel they proxy through /api/uploads via `loadUploadBytes`,
  // which already has the full tree in its own bundle.
  outputFileTracingExcludes: {
    "/api/daily-reports/\\[reportId\\]/drawings/copy-from-yesterday": [
      "./uploads/**/*",
    ],
    "/api/daily-reports/\\[reportId\\]/other-attachments/copy-from-yesterday": [
      "./uploads/**/*",
    ],
  },
};

export default withNextIntl(nextConfig);
