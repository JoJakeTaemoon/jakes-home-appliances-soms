/**
 * POST /api/auth/password-reset/request
 *
 * Anonymous endpoint — accepts `{ phone }`, generates a 6-digit recovery
 * code, hashes it onto the User, fires `SMS_STAFF_RESET_CODE`. Always
 * responds 200 to prevent account-enumeration; the SMS only goes out for
 * an actually-existing ACTIVE user. Throttled to one request per minute
 * per phone.
 */

import { NextRequest } from "next/server";
import { passwordResetRequestSchema } from "@/lib/validators/auth";
import { requestRecoveryCode } from "@/lib/auth/recovery";
import {
  successResponse,
  toErrorResponse,
} from "@/lib/api/response";
import { ValidationError } from "@/lib/api/error";

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
    const parsed = passwordResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payload",
        parsed.error.issues.map((i) => ({
          path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
          message: i.message,
        })),
      );
    }

    const outcome = await requestRecoveryCode({
      phone: parsed.data.phone,
      locale: parsed.data.locale,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    // Always respond 200 with a generic shape — successful and unknown-phone
    // outcomes look identical so an attacker can't enumerate accounts.
    // Throttling surfaces as `throttled: true` so the UI can show a friendly
    // "wait a moment" hint without leaking whether the phone exists.
    if (outcome.ok === false && outcome.reason === "THROTTLED") {
      return successResponse({
        sent: true,
        throttled: true,
        retryAfterSec: Math.ceil(outcome.retryAfterMs / 1000),
        expiresInMinutes: 10,
      });
    }
    return successResponse({
      sent: true,
      throttled: false,
      expiresInMinutes: 10,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
