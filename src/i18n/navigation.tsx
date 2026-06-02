"use client";

import NextLink from "next/link";
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { canonicalizePath, localizeHref } from "./path";

export { getPathname } from "./path";
export { redirect } from "./redirect";

/**
 * Group-aware locale-aware navigation helpers (client components/hooks).
 *
 * Replaces next-intl's `createNavigation(routing)` because our URL scheme
 * (docs/URL_SCHEME.md) places the user-group prefix (`/o`, `/f`) OUTSIDE
 * the locale segment, which next-intl's default helpers cannot produce.
 *
 * Pure-path helpers live in `./path` and the server `redirect` in
 * `./redirect` so that Server Components can import them without
 * tripping the "call a client function from the server" guard.
 */

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
