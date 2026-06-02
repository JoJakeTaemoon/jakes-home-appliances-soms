import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

/**
 * URL scheme middleware — see docs/URL_SCHEME.md for the contract.
 *
 *   {protocol}://{host}/{group?}/{locale?}/{path}
 *
 *   group:   "o" → office | "f" → field | absent → customer
 *   locale:  "en" | "ko" | "vi" | absent → en (silent, no redirect)
 *
 * Responsibilities:
 *   1. Parse the URL into (group, locale, rest).
 *   2. Enforce the per-group refresh cookie on non-public paths; on miss
 *      redirect to that group's login.
 *   3. If locale was omitted, INTERNAL rewrite to insert `/en` so the
 *      file-tree's [locale] dynamic segment resolves. The browser URL
 *      bar is not changed (per URL_SCHEME.md §3.2 — no-redirect rule).
 *
 * Note: next-intl's createMiddleware is intentionally NOT used here.
 * The group prefix sits outside the locale segment, and the silent-en
 * rewrite is incompatible with next-intl's redirect-to-canonical
 * behavior. Locale is still surfaced to React via `[locale]` dynamic
 * params + `getRequestConfig`; navigation helpers from
 * `@/i18n/navigation` continue to generate per-locale URLs.
 */

const LOCALES = routing.locales as readonly string[];

// Public sub-paths (no auth) — after group prefix and locale are stripped.
const OFFICE_PUBLIC = ["/login", "/forgot-password"];
const FIELD_PUBLIC = ["/login"];
const CUSTOMER_PUBLIC = ["/login", "/forgot-password", "/change-password"];

type Group = "office" | "field" | "customer";
type GroupPrefix = "" | "/o" | "/f";

interface ParsedUrl {
  group: Group;
  groupPrefix: GroupPrefix;
  locale: string;
  hasExplicitLocale: boolean;
  rest: string; // path after group + locale, leading slash, "/" for root
}

function parseUrl(pathname: string): ParsedUrl {
  const segments = pathname.split("/").filter(Boolean);

  let group: Group = "customer";
  let groupPrefix: GroupPrefix = "";
  let afterGroup = segments;
  if (segments[0] === "o") {
    group = "office";
    groupPrefix = "/o";
    afterGroup = segments.slice(1);
  } else if (segments[0] === "f") {
    group = "field";
    groupPrefix = "/f";
    afterGroup = segments.slice(1);
  }

  let locale = routing.defaultLocale as string;
  let hasExplicitLocale = false;
  let afterLocale = afterGroup;
  if (afterGroup[0] && LOCALES.includes(afterGroup[0])) {
    locale = afterGroup[0];
    hasExplicitLocale = true;
    afterLocale = afterGroup.slice(1);
  }

  const rest = afterLocale.length === 0 ? "/" : `/${afterLocale.join("/")}`;
  return { group, groupPrefix, locale, hasExplicitLocale, rest };
}

const PUBLIC_BY_GROUP: Record<Group, readonly string[]> = {
  office: OFFICE_PUBLIC,
  field: FIELD_PUBLIC,
  customer: CUSTOMER_PUBLIC,
};

const COOKIE_BY_GROUP: Record<Group, string> = {
  office: "officeRefreshToken",
  field: "fieldRefreshToken",
  customer: "customerRefreshToken",
};

const GROUP_PREFIX: Record<Group, GroupPrefix> = {
  office: "/o",
  field: "/f",
  customer: "",
};

function isPublic(group: Group, rest: string): boolean {
  // Group home (`/`, `/o`, `/f`) is treated as public; the page itself
  // decides whether to render a marketing landing or kick the user to
  // login. This avoids a middleware redirect loop on first visit.
  if (rest === "/") return true;
  return PUBLIC_BY_GROUP[group].some(
    (p) => rest === p || rest.startsWith(`${p}/`),
  );
}

function buildLoginUrl(group: Group, locale: string): string {
  const localePrefix =
    locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${GROUP_PREFIX[group]}${localePrefix}/login`;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const parsed = parseUrl(pathname);

  // 1. Realm cookie gate
  if (!isPublic(parsed.group, parsed.rest)) {
    if (!request.cookies.has(COOKIE_BY_GROUP[parsed.group])) {
      const url = request.nextUrl.clone();
      url.pathname = buildLoginUrl(parsed.group, parsed.locale);
      if (parsed.rest !== "/" && parsed.rest !== "/login") {
        url.searchParams.set("next", `${parsed.groupPrefix}${parsed.rest}`);
      }
      return NextResponse.redirect(url);
    }
  }

  // 2. Locale-optional silent rewrite — insert /en so [locale] resolves.
  if (!parsed.hasExplicitLocale) {
    const url = request.nextUrl.clone();
    const tail = parsed.rest === "/" ? "" : parsed.rest;
    url.pathname = `${parsed.groupPrefix}/${parsed.locale}${tail}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
