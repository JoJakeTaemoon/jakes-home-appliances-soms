/**
 * Pure path helpers for the URL scheme (see docs/URL_SCHEME.md).
 *
 * Server-safe — no React, no client directive. The client-side Link /
 * useRouter / usePathname / redirect helpers in `./navigation.tsx`
 * delegate to these.
 */

import { routing, type Locale } from "./routing";

const LOCALES = routing.locales as readonly string[];
const DEFAULT_LOCALE = routing.defaultLocale;

export type GroupPrefix = "" | "/o" | "/f";

export interface SplitResult {
  groupPrefix: GroupPrefix;
  rest: string; // leading slash, "/" when group root
}

export function splitGroup(path: string): SplitResult {
  if (path === "/o") return { groupPrefix: "/o", rest: "/" };
  if (path === "/f") return { groupPrefix: "/f", rest: "/" };
  if (path.startsWith("/o/")) return { groupPrefix: "/o", rest: path.slice(2) };
  if (path.startsWith("/f/")) return { groupPrefix: "/f", rest: path.slice(2) };
  return { groupPrefix: "", rest: path };
}

export function hasLocaleSegment(rest: string): boolean {
  if (rest === "/" || rest === "") return false;
  const first = rest.split("/").find(Boolean);
  return first !== undefined && LOCALES.includes(first);
}

/**
 * Insert locale after group prefix. Honours an explicit locale already
 * present in the href. Returns external / non-absolute / hash / query
 * inputs unchanged.
 */
export function localizeHref(href: string, locale: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const candidates = [hashIndex, queryIndex].filter((i) => i !== -1);
  const splitAt =
    candidates.length === 0 ? href.length : Math.min(...candidates);
  const pathOnly = href.slice(0, splitAt);
  const tail = href.slice(splitAt);

  const { groupPrefix, rest } = splitGroup(pathOnly);
  if (hasLocaleSegment(rest)) return href;

  const localePart = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const restPart = rest === "/" ? "" : rest;
  const out = `${groupPrefix}${localePart}${restPart}` || "/";

  return `${out}${tail}`;
}

/**
 * Strip a known locale segment so nav components can compare against
 * canonical hrefs (`/o/dashboard`, `/f/today`, `/equipment`) regardless
 * of the current locale.
 */
export function canonicalizePath(path: string): string {
  if (!path.startsWith("/")) return path;
  const { groupPrefix, rest } = splitGroup(path);
  if (!hasLocaleSegment(rest)) return path;
  const segs = rest.split("/").filter(Boolean);
  const dropped = segs.slice(1).join("/");
  if (dropped === "") return groupPrefix === "" ? "/" : groupPrefix;
  return `${groupPrefix}/${dropped}`;
}

/**
 * Build a localized pathname — usable in server and client contexts.
 */
export function getPathname({
  href,
  locale,
}: Readonly<{ href: string; locale: Locale }>): string {
  return localizeHref(href, locale);
}
