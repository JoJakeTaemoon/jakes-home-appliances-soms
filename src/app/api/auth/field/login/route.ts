/**
 * POST /api/auth/field/login
 *
 * Mirrors /api/auth/login but mints a `field` audience token and writes
 * the field cookies instead of the office ones. Accepts phone identifier
 * (technicians log in by phone per spec K.2). Username login is allowed
 * here too for completeness, but the canonical mobile flow is phone-only.
 *
 * Cross-realm enforcement: if the matched User row is NOT TECHNICIAN, we
 * respond with 409 ROLE_MISMATCH and a `suggestedUrl` pointing at the
 * office login page. The form layer (step 8) consumes that suggestion to
 * redirect the user to the right realm without making them retype the
 * credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { loginSchema } from "@/lib/validators/auth";
import { verifyPassword } from "@/lib/auth/password";
import { fieldRealm } from "@/lib/auth/realms/field-realm";
import { signFieldAccessToken } from "@/lib/auth/jwt";
import {
  createSession as coreCreateSession,
} from "@/lib/auth/core/session";
import {
  isLockedOut,
  recordLoginAttempt,
} from "@/lib/auth/lockout";
import {
  successResponse,
  errorResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

const OFFICE_LOGIN_URL_BY_LOCALE: Record<string, string> = {
  ko: "/ko/o/login",
  vi: "/vi/o/login",
  en: "/en/o/login",
};

function suggestedOfficeUrl(req: NextRequest): string {
  const referer = req.headers.get("referer") ?? "";
  const m = /\/(ko|vi|en)\//.exec(referer);
  const locale = m?.[1] ?? "vi";
  return OFFICE_LOGIN_URL_BY_LOCALE[locale] ?? "/vi/o/login";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid login payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const { username, phone, password } = parsed.data;
    const ipAddress = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    const normalizedPhone = phone ? phone.replace(/[^\d+]/g, "") : undefined;
    const userSelect = {
      id: true,
      username: true,
      email: true,
      phone: true,
      passwordHash: true,
      role: true,
      status: true,
      mustChangePassword: true,
      failedLoginCount: true,
      lockedUntil: true,
    } as const;
    type UserRecord = {
      id: string;
      username: string;
      email: string | null;
      phone: string | null;
      passwordHash: string;
      role: "ADMIN" | "MANAGER" | "STAFF" | "TECHNICIAN";
      status: "ACTIVE" | "DISABLED";
      mustChangePassword: boolean;
      failedLoginCount: number;
      lockedUntil: Date | null;
    };
    let user: UserRecord | null = null;
    if (username) {
      user = (await prisma.user.findFirst({
        where: { username },
        select: userSelect,
      })) as UserRecord | null;
    } else if (normalizedPhone) {
      user = (await prisma.user.findUnique({
        where: { phone: normalizedPhone },
        select: userSelect,
      })) as UserRecord | null;
    }

    const identifier = username ?? normalizedPhone ?? "(unknown)";

    if (!user) {
      await recordLoginAttempt({
        username: identifier,
        success: false,
        ipAddress,
        userAgent,
      });
      await logAudit({
        actorType: "SYSTEM",
        action: "LOGIN_FAILED",
        entityType: "User",
        after: { identifier, realm: "field", reason: "UNKNOWN_USERNAME" },
        request,
      });
      return errorResponse(
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    if (user.status !== "ACTIVE") {
      await recordLoginAttempt({
        username: user.username,
        userId: user.id,
        success: false,
        ipAddress,
        userAgent,
      });
      await logAudit({
        actorType: "SYSTEM",
        actorId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        after: { realm: "field", reason: "ACCOUNT_INACTIVE" },
        request,
      });
      return errorResponse(
        "Account is inactive",
        403,
        "ACCOUNT_INACTIVE",
      );
    }

    if (isLockedOut(user)) {
      await recordLoginAttempt({
        username: user.username,
        userId: user.id,
        success: false,
        ipAddress,
        userAgent,
      });
      await logAudit({
        actorType: "SYSTEM",
        actorId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        after: { realm: "field", reason: "LOCKED_OUT" },
        request,
      });
      return errorResponse(
        "Account is temporarily locked",
        423,
        "ACCOUNT_LOCKED",
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await recordLoginAttempt({
        username: user.username,
        userId: user.id,
        success: false,
        ipAddress,
        userAgent,
      });
      const refreshed = await prisma.user.findUnique({
        where: { id: user.id },
        select: { lockedUntil: true },
      });
      const lockedNow = isLockedOut(refreshed);
      await logAudit({
        actorType: "SYSTEM",
        actorId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        after: { realm: "field", reason: "WRONG_PASSWORD", lockedNow },
        request,
      });
      if (lockedNow) {
        return errorResponse(
          "Account is temporarily locked",
          423,
          "ACCOUNT_LOCKED",
        );
      }
      return errorResponse(
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    // ── role gate ──────────────────────────────────────────────────
    // Credentials are valid but this realm only accepts TECHNICIAN.
    // Anything else gets a 409 with a suggested redirect to the office
    // login so the form can route the user without a retype.
    if (user.role !== "TECHNICIAN") {
      await logAudit({
        actorType: "SYSTEM",
        actorId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        after: { realm: "field", reason: "ROLE_MISMATCH", actualRole: user.role },
        request,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "This page is for field technicians only",
            code: "ROLE_MISMATCH",
            suggestedRealm: "office",
            suggestedUrl: suggestedOfficeUrl(request),
          },
        },
        { status: 409 },
      );
    }

    // ── success ────────────────────────────────────────────────────
    await recordLoginAttempt({
      username: user.username,
      userId: user.id,
      success: true,
      ipAddress,
      userAgent,
    });

    const session = await coreCreateSession(fieldRealm, {
      actorId: user.id,
      userAgent: userAgent ?? null,
      ipAddress,
    });
    const accessToken = await signFieldAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    await logAudit({
      actorType: "USER",
      actorId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "User",
      entityId: user.id,
      after: { realm: "field", sessionId: session.sessionId },
      request,
    });

    const res = successResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      accessToken,
    });
    fieldRealm.setCookies(res, { accessToken, refreshToken: session.refreshToken });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
