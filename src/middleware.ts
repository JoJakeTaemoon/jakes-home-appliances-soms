import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Public suffixes (no auth) — locale-stripped paths
const PUBLIC_OFFICE_SUFFIXES = ["/login"];
const PUBLIC_FIELD_SUFFIXES = ["/mobile/login"];
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

function isFieldPath(stripped: string): boolean {
  return stripped === "/mobile" || stripped.startsWith("/mobile/");
}

function isPublicFieldPath(stripped: string): boolean {
  return PUBLIC_FIELD_SUFFIXES.some(
    (suffix) => stripped === suffix || stripped.startsWith(`${suffix}/`),
  );
}

function isPublicOfficePath(stripped: string): boolean {
  return PUBLIC_OFFICE_SUFFIXES.some(
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

function buildOfficeLoginRedirect(
  request: NextRequest,
  stripped: string,
  locale: string,
): URL {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  if (stripped !== "/" && stripped !== "/login") {
    url.searchParams.set("next", stripped);
  }
  return url;
}

function buildFieldLoginRedirect(
  request: NextRequest,
  stripped: string,
  locale: string,
): URL {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/mobile/login`;
  if (stripped !== "/mobile" && stripped !== "/mobile/login") {
    url.searchParams.set("next", stripped);
  }
  return url;
}

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

/**
 * 3-realm middleware (steps 4-7 of the auth split).
 *
 *   Path under /[locale]/    | Realm    | Required cookie
 *   --------------------------+----------+-----------------------
 *   /portal/login + others    | (public) | —
 *   /portal/*                 | customer | customerRefreshToken
 *   /mobile/login             | (public) | —
 *   /mobile/*                 | field    | fieldRefreshToken
 *   /login                    | (public) | —
 *   everything else           | office   | refreshToken (staff)
 *
 * Cookies are distinct names per realm so the three sessions can coexist
 * in the same browser without colliding. Middleware only checks cookie
 * presence; full audience verification happens in route handlers via the
 * realm-bound hydrate helpers.
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const stripped = stripLocale(pathname);
  const locale = currentLocale(pathname);

  // Customer (portal) realm
  if (isPublicPortalPath(stripped)) {
    return intlMiddleware(request);
  }
  if (isPortalPath(stripped)) {
    if (!request.cookies.has("customerRefreshToken")) {
      return NextResponse.redirect(
        buildPortalLoginRedirect(request, stripped, locale),
      );
    }
    return intlMiddleware(request);
  }

  // Field (technician) realm — requires the field refresh cookie. An office
  // staff cookie alone does NOT grant access; technicians must log in via
  // /mobile/login to mint a field session.
  if (isPublicFieldPath(stripped)) {
    return intlMiddleware(request);
  }
  if (isFieldPath(stripped)) {
    if (!request.cookies.has("fieldRefreshToken")) {
      return NextResponse.redirect(
        buildFieldLoginRedirect(request, stripped, locale),
      );
    }
    return intlMiddleware(request);
  }

  // Office (HQ) realm — everything else.
  if (isPublicOfficePath(stripped)) {
    return intlMiddleware(request);
  }
  if (!request.cookies.has("refreshToken")) {
    return NextResponse.redirect(
      buildOfficeLoginRedirect(request, stripped, locale),
    );
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
