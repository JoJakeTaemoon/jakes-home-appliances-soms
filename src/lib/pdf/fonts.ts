/**
 * Font registration for @react-pdf/renderer.
 *
 * TODO (Phase 3.5): drop full Pretendard / Be Vietnam Pro / Inter TTFs into
 * `public/fonts/` and register them here so the rendered PDFs can show the
 * brand typography on the server. For Phase 3 we register a single safe
 * Korean-capable family ("Pretendard" via the variable woff2 that already
 * lives in public/fonts) but otherwise fall back to the @react-pdf bundled
 * Helvetica family — which handles Latin / Vietnamese diacritics out of the
 * box but cannot render Korean. The contract templates print the bilingual
 * header label fields ("HỢP ĐỒNG / 계약서") with the Korean half wrapped in a
 * dedicated KO style block so we can swap the font in later without
 * touching the templates.
 *
 * `registerFonts()` is idempotent — it's safe to call from every render.
 */

import { Font } from "@react-pdf/renderer";
import path from "node:path";
import fs from "node:fs";

let registered = false;

const DEFAULT_FAMILY = "Helvetica";
export const PDF_FONT_FAMILY = {
  ko: DEFAULT_FAMILY, // TODO: swap to "Pretendard" once a .ttf is available
  vi: DEFAULT_FAMILY,
  en: DEFAULT_FAMILY,
} as const;

/**
 * Register optional brand fonts if the source files exist on disk. We accept
 * a graceful fallback so the renderer never crashes in CI / sandboxes that
 * lack the binaries.
 */
export function registerFonts(): void {
  if (registered) return;
  registered = true;

  const fontsDir = path.join(process.cwd(), "public", "fonts");

  const candidates: { family: string; file: string; fontWeight?: number | "bold" }[] = [
    { family: "Pretendard", file: "Pretendard-Regular.ttf" },
    { family: "Pretendard", file: "Pretendard-Bold.ttf", fontWeight: "bold" },
    { family: "BeVietnamPro", file: "BeVietnamPro-Regular.ttf" },
    { family: "BeVietnamPro", file: "BeVietnamPro-Bold.ttf", fontWeight: "bold" },
    { family: "Inter", file: "Inter-Regular.ttf" },
    { family: "Inter", file: "Inter-Bold.ttf", fontWeight: "bold" },
  ];

  for (const c of candidates) {
    try {
      const abs = path.join(fontsDir, c.file);
      if (fs.existsSync(abs)) {
        Font.register({ family: c.family, src: abs, fontWeight: c.fontWeight });
      }
    } catch {
      // Best-effort — ignore registration failures and let Helvetica fallback take over.
    }
  }
}
