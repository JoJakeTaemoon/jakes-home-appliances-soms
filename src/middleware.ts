import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = ["/login", "/register"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) ||
      routing.locales.some((l) => pathname === `/${l}${p}` || pathname.startsWith(`/${l}${p}/`))
  );
}

function isAuthApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth/");
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Skip _next internals and static files (images, fonts, favicon, etc.)
  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // 1. API routes — pass through, no locale handling, no auth check
  if (isApiPath(pathname)) {
    return NextResponse.next();
  }

  const hasRefreshToken = request.cookies.has("refreshToken");

  // 2. Public auth pages (login, register)
  //    Always allow access — login page handles its own logout on mount
  if (isPublicPath(pathname)) {
    return intlMiddleware(request);
  }

  // 3. All other routes (protected)
  if (!hasRefreshToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

// Next.js 16: matcher is handled inside the middleware function.
// Static files and _next are excluded by the isApiPath / dot-check logic above.
