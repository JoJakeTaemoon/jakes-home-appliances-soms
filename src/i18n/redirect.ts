import { redirect as nextRedirect } from "next/navigation";
import { localizeHref } from "./path";
import type { Locale } from "./routing";

/**
 * Server-side redirect with locale awareness.
 *
 * Lives in its own module (not in `./navigation.tsx`, which is a
 * `"use client"` module) so Server Components can import it without
 * Next.js complaining about calling a client function from the server.
 */
export function redirect({
  href,
  locale,
}: Readonly<{ href: string; locale: Locale }>): never {
  nextRedirect(localizeHref(href, locale));
}
