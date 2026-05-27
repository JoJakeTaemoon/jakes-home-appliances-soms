/**
 * POST /api/portal/auth/login — UC-AU-04 (customer portal login).
 *
 * Flow:
 *   1. Look up CustomerContacts by `phone1` (could be > 1 — A.13 shared phone).
 *   2. If 0 → 401 generic error (no enumeration).
 *   3. If > 1 AND no `contactId` provided → 200 with `candidates[]` so the
 *      UI can prompt the user to pick which contact to log in as.
 *   4. If exactly 1 (or contactId picked the right row) → verify password,
 *      apply lockout / mustChangePassword logic, mint customer JWT + session,
 *      set cookies.
 *
 * Lockout is per-contact (separate from staff lockout). Failed-login forensics
 * are written to AuditLog as `PORTAL_LOGIN_FAILED`.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { portalLoginSchema } from "@/lib/validators/portalAuth";
import { verifyPassword } from "@/lib/auth/password";
import { signCustomerAccessToken } from "@/lib/auth/jwt";
import { createCustomerSession } from "@/lib/auth/customer-session";
import { setCustomerAuthCookies } from "@/lib/auth/customer-cookies";
import {
  isContactLockedOut,
  recordCustomerFailedLogin,
  recordCustomerLoginSuccess,
} from "@/lib/auth/customer-lockout";
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = portalLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid login payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }
    const { phone, password, contactId } = parsed.data;
    const ipAddress = clientIp(request);
    const userAgent = request.headers.get("user-agent");

    // Match all portal-enabled contacts with this phone.
    const candidates = await prisma.customerContact.findMany({
      where: { phone1: phone, portalEnabled: true },
      include: {
        customer: { select: { id: true, code: true, name: true } },
      },
    });

    if (candidates.length === 0) {
      await logAudit({
        actorType: "SYSTEM",
        action: "PORTAL_LOGIN_FAILED",
        entityType: "CustomerContact",
        after: { phone, reason: "UNKNOWN_PHONE" },
        request,
      });
      return errorResponse("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    // Disambiguation step — multiple matches, no contactId picked yet.
    if (candidates.length > 1 && !contactId) {
      return successResponse({
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          customerName: c.customer.name,
          customerCode: c.customer.code,
        })),
      });
    }

    const selected =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((c) => c.id === contactId);

    if (!selected) {
      await logAudit({
        actorType: "SYSTEM",
        action: "PORTAL_LOGIN_FAILED",
        entityType: "CustomerContact",
        after: { phone, contactId, reason: "CONTACT_NOT_IN_CANDIDATES" },
        request,
      });
      return errorResponse("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    if (isContactLockedOut(selected)) {
      await logAudit({
        actorType: "SYSTEM",
        actorId: selected.id,
        action: "PORTAL_LOGIN_FAILED",
        entityType: "CustomerContact",
        entityId: selected.id,
        after: { reason: "LOCKED_OUT", lockedUntil: selected.lockedUntil },
        request,
      });
      return errorResponse("Account is temporarily locked", 423, "ACCOUNT_LOCKED");
    }

    if (!selected.passwordHash) {
      await recordCustomerFailedLogin(selected.id);
      await logAudit({
        actorType: "SYSTEM",
        actorId: selected.id,
        action: "PORTAL_LOGIN_FAILED",
        entityType: "CustomerContact",
        entityId: selected.id,
        after: { reason: "NO_PASSWORD_SET" },
        request,
      });
      return errorResponse("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const ok = await verifyPassword(password, selected.passwordHash);
    if (!ok) {
      await recordCustomerFailedLogin(selected.id);
      const refreshed = await prisma.customerContact.findUnique({
        where: { id: selected.id },
        select: { lockedUntil: true },
      });
      const lockedNow = isContactLockedOut(refreshed);
      await logAudit({
        actorType: "SYSTEM",
        actorId: selected.id,
        action: "PORTAL_LOGIN_FAILED",
        entityType: "CustomerContact",
        entityId: selected.id,
        after: { reason: "WRONG_PASSWORD", lockedNow },
        request,
      });
      if (lockedNow) {
        return errorResponse("Account is temporarily locked", 423, "ACCOUNT_LOCKED");
      }
      return errorResponse("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    // ── success ────────────────────────────────────────────────────────
    await recordCustomerLoginSuccess(selected.id);

    const session = await createCustomerSession({
      contactId: selected.id,
      userAgent: userAgent ?? null,
      ipAddress,
    });
    const accessToken = await signCustomerAccessToken({
      contactId: selected.id,
      customerId: selected.customerId,
      contactRole: selected.role,
    });

    await logAudit({
      actorType: "CUSTOMER",
      actorId: selected.id,
      action: "PORTAL_LOGIN_SUCCESS",
      entityType: "CustomerContact",
      entityId: selected.id,
      after: { sessionId: session.sessionId },
      request,
    });

    const res = successResponse({
      contact: {
        id: selected.id,
        customerId: selected.customerId,
        customerName: selected.customer.name,
        customerCode: selected.customer.code,
        name: selected.name,
        phone1: selected.phone1,
        email: selected.email,
        language: selected.language,
        role: selected.role,
        scope: selected.scope,
        siteId: selected.siteId,
        mustChangePassword: selected.mustChangePassword,
      },
      accessToken,
      mustChangePassword: selected.mustChangePassword,
    });
    setCustomerAuthCookies(res, {
      accessToken,
      refreshToken: session.refreshToken,
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
