import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Public suffixes (no auth) — locale-stripped paths
const PUBLIC_STAFF_SUFFIXES = ["/login", "/mobile/login"];
const PUBLIC_PORTAL_SUFFIXES = [
  "/portal/login",
  "/portal/forgot-password",
];

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

function isPortalPath(stripped: string): boolean {
  return stripped === "/portal" || stripped.startsWith("/portal/");
}

function isPublicPortalPath(stripped: string): boolean {
  return PUBLIC_PORTAL_SUFFIXES.some(
    (suffix) => stripped === suffix || stripped.startsWith(`${suffix}/`),
  );
}

function isPublicStaffPath(stripped: string): boolean {
  return PUBLIC_STAFF_SUFFIXES.some(
    (suffix) => stripped === suffix || stripped.startsWith(`${suffix}/`),
  );
}

function currentLocale(pathname: string): string {
  return (
    routing.locales.find(
      (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`,
    ) ?? routing.defaultLocale
  );
}

function isMobilePath(stripped: string): boolean {
  return stripped === "/mobile" || stripped.startsWith("/mobile/");
}

/**
 * Build the redirect URL when a staff/technician hits a protected page
 * without a refresh cookie. Splits between mobile and office login routes.
 */
function buildLoginRedirect(
  request: NextRequest,
  stripped: string,
  locale: string,
): URL {
  const url = request.nextUrl.clone();
  url.pathname = isMobilePath(stripped)
    ? `/${locale}/mobile/login`
    : `/${locale}/login`;
  if (stripped !== "/" && stripped !== "/login") {
    url.searchParams.set("next", stripped);
  }
  return url;
}

/**
 * Portal-side redirect — mirrors the office helper but for customer auth.
 */
function buildPortalLoginRedirect(
  request: NextRequest,
  stripped: string,
  locale: string,
): URL {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/portal/login`;
  if (stripped !== "/portal" && stripped !== "/portal/login") {
    url.searchParams.set("next", stripped);
  }
  return url;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Skip Next.js internals and any path containing a dot.
  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // 1. API routes pass through untouched — locale + auth happen inside the
  //    route handlers (which know the difference between Bearer and cookie).
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const stripped = stripLocale(pathname);
  const locale = currentLocale(pathname);

  // 2a. Portal public pages — always reachable; intl handles locale prefix.
  if (isPublicPortalPath(stripped)) {
    return intlMiddleware(request);
  }

  // 2b. Portal protected pages — require customerRefreshToken cookie.
  //     Customer + staff cookies are distinct names so they don't collide;
  //     middleware just checks for the cookie's existence (full verify
  //     happens inside route handlers via requireCustomerAuth).
  if (isPortalPath(stripped)) {
    if (!request.cookies.has("customerRefreshToken")) {
      return NextResponse.redirect(
        buildPortalLoginRedirect(request, stripped, locale),
      );
    }
    return intlMiddleware(request);
  }

  // 3. Staff public pages
  if (isPublicStaffPath(stripped)) {
    return intlMiddleware(request);
  }

  // 4. Staff protected pages — require staff refreshToken cookie.
  if (!request.cookies.has("refreshToken")) {
    return NextResponse.redirect(buildLoginRedirect(request, stripped, locale));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
