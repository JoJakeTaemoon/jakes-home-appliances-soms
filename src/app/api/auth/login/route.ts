/**
 * POST /api/auth/login
 *
 * Verifies username + password, mints an office access + refresh token,
 * writes a Session row, sets cookies, and returns the access token in
 * the body for the React Query client to hold in memory.
 *
 * Cross-realm enforcement: this realm accepts ADMIN / MANAGER / STAFF
 * only. A TECHNICIAN who lands here gets a 409 ROLE_MISMATCH with a
 * suggestedUrl pointing at the field login so the form can route the
 * user without a retype. Mirrors `/api/auth/field/login`.
 *
 * Implements UC-AU-01 (office login + lockout).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { loginSchema } from "@/lib/validators/auth";
import { verifyPassword } from "@/lib/auth/password";
import { signStaffAccessToken } from "@/lib/auth/jwt";
import { createSession } from "@/lib/auth/session";
import {
  isLockedOut,
  recordLoginAttempt,
  LOCKOUT_DURATION_MS,
} from "@/lib/auth/lockout";
import { setAuthCookies } from "@/lib/auth/cookies";
import { successResponse, errorResponse, toErrorResponse } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";
import { logAudit } from "@/lib/audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

// docs/URL_SCHEME.md §2.2: field login is `/f/login` (en silent),
// `/f/ko/login`, `/f/vi/login`. Locale-after-group, en omitted.
const FIELD_LOGIN_URL_BY_LOCALE: Record<string, string> = {
  en: "/f/login",
  ko: "/f/ko/login",
  vi: "/f/vi/login",
};

function suggestedFieldUrl(req: NextRequest): string {
  const referer = req.headers.get("referer") ?? "";
  const m = /\/(ko|vi|en)\b/.exec(referer);
  const locale = m?.[1] ?? "en";
  return FIELD_LOGIN_URL_BY_LOCALE[locale] ?? "/f/login";
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

    // Identifier: prefer username when supplied, otherwise resolve via phone
    // (technicians log in by phone per K.2). We normalize the phone match by
    // stripping non-digits + optional leading + so "+84-90-000-0001" and
    // "0900000001" both match.
    const normalizedPhone = phone
      ? phone.replace(/[^\d+]/g, "")
      : undefined;
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
    let ambiguousUsername = false;
    if (username) {
      // username is no longer @unique (it's a display label) — phone is the
      // canonical login key. We still accept username for back-compat, but
      // fail-closed if more than one row matches so an attacker can't
      // authenticate as an arbitrary staff member that happens to share a
      // label. Both branches return the generic INVALID_CREDENTIALS error so
      // we don't leak whether the ambiguity exists.
      const matches = (await prisma.user.findMany({
        where: { username },
        select: userSelect,
        take: 2,
      })) as UserRecord[];
      if (matches.length > 1) {
        ambiguousUsername = true;
      } else if (matches.length === 1) {
        user = matches[0];
      }
    } else if (normalizedPhone) {
      user = (await prisma.user.findUnique({
        where: { phone: normalizedPhone },
        select: userSelect,
      })) as UserRecord | null;
    }

    // Identifier used downstream for LoginAttempt / audit trail.
    const identifier = username ?? normalizedPhone ?? "(unknown)";

    // Unknown username/phone OR ambiguous username — record attempt for
    // forensics but return the same generic error in both cases so we don't
    // leak whether the username is unknown vs. shared.
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
        after: {
          identifier,
          reason: ambiguousUsername ? "AMBIGUOUS_USERNAME" : "UNKNOWN_USERNAME",
        },
        request,
      });
      return errorResponse(
        "Invalid credentials",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    // Inactive account — refuse before checking the password so a disabled
    // account can't be confirmed by attempting to log in.
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
        after: { reason: "ACCOUNT_INACTIVE" },
        request,
      });
      return errorResponse(
        "Account is inactive",
        403,
        "ACCOUNT_INACTIVE",
      );
    }

    // Lockout path — block before password check so an attacker can't
    // distinguish locked from unlocked accounts by timing.
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
        after: { reason: "LOCKED_OUT", lockedUntil: user.lockedUntil },
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
      // After the increment, check whether the threshold was reached so we
      // can return a more specific error on the lockout-trigger attempt.
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
        after: {
          reason: "WRONG_PASSWORD",
          lockedNow,
        },
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
    // Credentials are valid but this realm only accepts office staff
    // (ADMIN / MANAGER / STAFF). TECHNICIAN belongs to the field realm
    // and gets a 409 + suggested redirect so the form can offer a
    // single-click jump without a credential retype.
    if (user.role === "TECHNICIAN") {
      await logAudit({
        actorType: "SYSTEM",
        actorId: user.id,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        after: { realm: "office", reason: "ROLE_MISMATCH", actualRole: user.role },
        request,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "This page is for office staff only",
            code: "ROLE_MISMATCH",
            suggestedRealm: "field",
            suggestedUrl: suggestedFieldUrl(request),
          },
        },
        { status: 409 },
      );
    }

    // ── success ─────────────────────────────────────────────────────
    await recordLoginAttempt({
      username: user.username,
      userId: user.id,
      success: true,
      ipAddress,
      userAgent,
    });

    const session = await createSession({
      userId: user.id,
      userAgent: userAgent ?? null,
      ipAddress,
    });
    const accessToken = await signStaffAccessToken({
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
      after: { sessionId: session.sessionId },
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
    setAuthCookies(res, { accessToken, refreshToken: session.refreshToken });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}

// Expose the lockout window in seconds for clients that want to count down
// to retry. Kept here (not just in the lockout module) so it's part of the
// route's public contract.
export const LOCKOUT_SECONDS = Math.floor(LOCKOUT_DURATION_MS / 1000);
