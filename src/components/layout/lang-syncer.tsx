"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

/**
 * Keep `<html lang="...">` in sync with the active next-intl locale.
 *
 * The root layout (`src/app/layout.tsx`) hardcodes `lang="ko"` because it
 * sits above the `[locale]` segment and has no access to the URL locale.
 * Native form controls (notably `<input type="date">`) read this
 * attribute to pick their UI language, so without this syncer the date
 * picker would stay Korean even after the user switches to English or
 * Vietnamese.
 *
 * Tradeoff: the initial SSR HTML still ships `lang="ko"`. The lang is
 * corrected during hydration, so any date input the user clicks AFTER
 * hydration uses the right locale. A click during the brief pre-
 * hydration window would still open the Korean picker — fixing that
 * requires moving `<html>` into `[locale]/layout.tsx`.
 */
export function LangSyncer() {
  const locale = useLocale();
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
