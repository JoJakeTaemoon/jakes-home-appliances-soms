import { defineRouting } from "next-intl/routing";

/**
 * Seoul Aqua SOMS supported locales.
 *
 * Vietnam is the primary market — defaultLocale is `vi`. Korean engineers
 * and English-speaking auditors / clients are also first-class. Locale
 * order in the array drives the LocaleSwitcher dropdown order.
 */
export const routing = defineRouting({
  locales: ["vi", "ko", "en"],
  defaultLocale: "vi",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
