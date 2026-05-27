/**
 * POST /api/portal/auth/refresh
 *
 * Reads the customerRefreshToken cookie, rotates the session, mints a new
 * customer access token. Called silently by `CustomerAuthProvider`.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  CUSTOMER_REFRESH_COOKIE,
  setCustomerAuthCookies,
  clearCustomerAuthCookies,
} from "@/lib/auth/customer-cookies";
import { rotateCustomerSession } from "@/lib/auth/customer-session";
import { signCustomerAccessToken } from "@/lib/auth/jwt";
import { successResponse, errorResponse, toErrorResponse } from "@/lib/api/response";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(CUSTOMER_REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      const res = errorResponse("Missing refresh token", 401, "NO_REFRESH_TOKEN");
      clearCustomerAuthCookies(res);
      return res;
    }

    const ipAddress = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    const rotated = await rotateCustomerSession(refreshToken, {
      ipAddress,
      userAgent,
    });
    if (!rotated) {
      const res = errorResponse(
        "Invalid or expired refresh token",
        401,
        "INVALID_REFRESH_TOKEN",
      );
      clearCustomerAuthCookies(res);
      return res;
    }

    const sessionRow = await prisma.customerSession.findUnique({
      where: { id: rotated.sessionId },
      select: {
        contact: {
          select: {
            id: true,
            customerId: true,
            name: true,
            phone1: true,
            email: true,
            language: true,
            role: true,
            scope: true,
            siteId: true,
            portalEnabled: true,
            mustChangePassword: true,
            customer: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!sessionRow || !sessionRow.contact.portalEnabled) {
      const res = errorResponse("Portal account disabled", 401, "PORTAL_DISABLED");
      clearCustomerAuthCookies(res);
      return res;
    }

    const c = sessionRow.contact;
    const accessToken = await signCustomerAccessToken({
      contactId: c.id,
      customerId: c.customerId,
      contactRole: c.role,
    });

    const res = successResponse({
      contact: {
        id: c.id,
        customerId: c.customerId,
        customerName: c.customer.name,
        customerCode: c.customer.code,
        name: c.name,
        phone1: c.phone1,
        email: c.email,
        language: c.language,
        role: c.role,
        scope: c.scope,
        siteId: c.siteId,
        mustChangePassword: c.mustChangePassword,
      },
      accessToken,
    });
    setCustomerAuthCookies(res, {
      accessToken,
      refreshToken: rotated.refreshToken,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
