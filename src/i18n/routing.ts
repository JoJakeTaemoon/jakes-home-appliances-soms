import { defineRouting } from "next-intl/routing";

/**
 * Jake's Home Appliances SOMS supported locales.
 *
 * Default is `en` and `localePrefix: "as-needed"` per docs/URL_SCHEME.md §3:
 * a URL with no locale segment is served as `en` in place, with no
 * redirect; `ko` and `vi` are explicit-prefix only. Locale order in the
 * array drives the LocaleSwitcher dropdown order.
 *
 * The user-group prefix (`o`, `f`, none) sits OUTSIDE the locale and is
 * handled by middleware before next-intl ever sees the path.
 */
export const routing = defineRouting({
  locales: ["en", "ko", "vi"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
