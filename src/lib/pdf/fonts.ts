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

/**
 * Font family per locale. Pretendard covers Hangul + Latin; Be Vietnam Pro
 * covers Latin + Vietnamese diacritics with proper hinting. Both are bundled
 * in `public/fonts/` as TTF. If a binary is missing on disk, `registerFonts`
 * silently falls back to Helvetica — which renders Latin only and garbles
 * Vietnamese diacritics / Korean.
 */
export const PDF_FONT_FAMILY = {
  ko: "NotoSansKR",
  vi: "BeVietnamPro",
  en: "BeVietnamPro",
} as const;

/** Family used by the page-level default style (Latin + Vietnamese capable). */
export const PDF_DEFAULT_FAMILY = "BeVietnamPro";

/**
 * Register optional brand fonts if the source files exist on disk. We accept
 * a graceful fallback so the renderer never crashes in CI / sandboxes that
 * lack the binaries.
 */
export function registerFonts(): void {
  if (registered) return;
  registered = true;

  const fontsDir = path.join(process.cwd(), "public", "fonts");

  // Korean — Pretendard "Alternative" misses some symbols (· — etc.),
  // so we fall back to Noto Sans KR (variable font) which has full Hangul +
  // Unicode symbol coverage. Listed second so Pretendard renders the bulk of
  // Korean text and Noto only catches the misses.
  const candidates: { family: string; file: string; fontWeight?: number | "bold" }[] = [
    { family: "Pretendard", file: "Pretendard-Regular.ttf" },
    { family: "Pretendard", file: "Pretendard-Bold.ttf", fontWeight: "bold" },
    { family: "NotoSansKR", file: "NotoSansKR-Variable.ttf" },
    { family: "BeVietnamPro", file: "BeVietnamPro-Regular.ttf" },
    { family: "BeVietnamPro", file: "BeVietnamPro-Bold.ttf", fontWeight: "bold" },
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
