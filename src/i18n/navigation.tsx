"use client";

import NextLink from "next/link";
import {
  redirect as nextRedirect,
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { routing, type Locale } from "./routing";

/**
 * Group-aware locale-aware navigation helpers.
 *
 * Replaces next-intl's `createNavigation(routing)` because our URL scheme
 * (docs/URL_SCHEME.md) places the user-group prefix (`/o`, `/f`) OUTSIDE
 * the locale segment, which next-intl's default helpers cannot produce.
 *
 * Behaviour summary:
 *
 *   - Locale `en` is silent — no prefix is emitted.
 *   - Locale `ko` / `vi` is inserted AFTER the group prefix:
 *       /o/dashboard       → /o/ko/dashboard      (locale=ko)
 *       /f/today           → /f/vi/today          (locale=vi)
 *       /equipment         → /ko/equipment        (customer, locale=ko)
 *       /o/dashboard       → /o/dashboard         (locale=en, default)
 *   - If the caller already includes a known locale segment, the href is
 *     returned untouched — `getPathname({ href: "/o/dashboard", locale: "vi" })`
 *     and `getPathname({ href: "/o/vi/dashboard", locale: "vi" })` both
 *     resolve to `/o/vi/dashboard`.
 *   - `usePathname()` returns the CANONICAL path (locale-stripped) so
 *     `pathname === item.href` matching in nav components works in any
 *     locale.
 */

const LOCALES = routing.locales as readonly string[];
const DEFAULT_LOCALE = routing.defaultLocale;

type GroupPrefix = "" | "/o" | "/f";

interface SplitResult {
  groupPrefix: GroupPrefix;
  rest: string; // leading slash, "/" when group root
}

function splitGroup(path: string): SplitResult {
  if (path === "/o") return { groupPrefix: "/o", rest: "/" };
  if (path === "/f") return { groupPrefix: "/f", rest: "/" };
  if (path.startsWith("/o/")) return { groupPrefix: "/o", rest: path.slice(2) };
  if (path.startsWith("/f/")) return { groupPrefix: "/f", rest: path.slice(2) };
  return { groupPrefix: "", rest: path };
}

function hasLocaleSegment(rest: string): boolean {
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

type LinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & {
  href: string;
};

export function Link({ href, ...rest }: Readonly<LinkProps>) {
  const locale = useLocale();
  return <NextLink {...rest} href={localizeHref(href, locale)} />;
}

interface NavRouter {
  push: (href: string, opts?: { scroll?: boolean }) => void;
  replace: (href: string, opts?: { scroll?: boolean }) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

export function useRouter(): NavRouter {
  const router = useNextRouter();
  const locale = useLocale();
  return useMemo<NavRouter>(
    () => ({
      push: (href, opts) => router.push(localizeHref(href, locale), opts),
      replace: (href, opts) => router.replace(localizeHref(href, locale), opts),
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
      prefetch: (href) => router.prefetch(localizeHref(href, locale)),
    }),
    [router, locale],
  );
}

export function usePathname(): string {
  return canonicalizePath(useNextPathname());
}

/**
 * Build a localized pathname for non-Link callers (e.g. LocaleSwitcher
 * needs to construct a URL in a different locale than the current one).
 */
export function getPathname({
  href,
  locale,
}: Readonly<{ href: string; locale: Locale }>): string {
  return localizeHref(href, locale);
}

/**
 * Server-side redirect with locale awareness. Mirrors the previous
 * next-intl signature so existing call-sites continue to compile.
 */
export function redirect({
  href,
  locale,
}: Readonly<{ href: string; locale: Locale }>): never {
  nextRedirect(localizeHref(href, locale));
}
